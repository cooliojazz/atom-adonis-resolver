const position = require('file-position');
const eval = require('static-eval');
const esprima = require('esprima');
const clone = require('clone');
const path = require('path');
const astw = require('astw');
const fs = require('fs');
const {Point, Range} = require('atom');

exports.activate = function() {
    atom.commands.add('atom-workspace', {'adonis-resolver:open-selected-dependencies': handleOpenDependencies});
}

exports.provideAdonisHyperclick = function() {
    return {
        providerName: "atom-adonis-resolver",
        priority: 0,
        wordRegExp: /(use|make)\s*\(\s*["'].+?["']\s*\)|(@component|@!component|@extends|@layout|@include)\s*\(\s*["'].+?["']\s*[),]/g,
        getSuggestionForWord: function(editor, string, range) {
            // Does not properly handle the case that a use call spans multiple lines, but wordRegExp seems to prevent that anyways.
            let match = string.match(/'(.+)'/);
            let start = range.start.column + match.index + 1;
            let end = start + match[1].length;
            return new Promise(r => r({range: new Range(new Point(range.start.row, start), new Point(range.start.row, end)), callback: handleOpenDependencies}));
        },
        grammarScopes: ["source.js", "source.ts", "text.html.edge"]
    };
};

function handleOpenDependencies() {
    let editor = atom.workspace.getActiveTextEditor();
    let ranges = editor.getSelectedBufferRanges().slice();
    let dir = atom.project.getPaths().filter(p => editor.getPath().includes(p))[0];
    let src = editor.getBuffer().getText();

    switch(editor.languageMode.grammar.scopeName) {
        case "source.js":
        case "source.ts": {
            let ast = esprima.parse(src, {loc: true});
            astw(ast)(handleAstNode(ranges, dir, position(src)));
            break;
        }
        case "text.html.edge": {
            handleEdge(editor, ranges, dir);
            break;
        }
    }
}

// This should be re-written to use the build in parsing trees instead of constructing our own
function handleAstNode(ranges, dir, lookup) {
    return node => {
        if (!(nodeIs("use")(node) || nodeIs("make")(node))) return;
        if (!node.arguments) return;
        if (!node.arguments.length) return;

        let dst = node.evalled = node.evalled || eval(node.arguments[0]);
        if (!dst) return;

        let included = false;

        for (let i = 0; i < ranges.length; i++) {
            let loc = clone(node.loc);

            loc.start.line--;
            loc.end.line--;

            let a = getIndex(lookup, ranges[i]);
            let b = getIndex(lookup, loc);

            if (included = overlap(a, b)) break;
        }

        if (!included) return;

        // First if it's a project file
        let parts = dst.split('/');
        let name = parts[parts.length - 1];
        let file = path.resolve(dir, parts[0].toLowerCase(), parts.slice(1, parts.length - 1).join('/'), name + ".js");
        if (fs.existsSync(file)) return atom.workspace.open(file);

        // Then if it's an Adonis file
        let adonisDir = path.resolve(dir, "node_modules", "@adonisjs");
        for (let subDir of fs.readdirSync(adonisDir)) {
            let srcDir = path.resolve(adonisDir, subDir, "src");
            if (fs.existsSync(srcDir)) {
                let ret = checkSubModules(srcDir, name);
                if (ret) return ret;
            }
        }

        // Need an inexpensive way to check every other module for any possible class Adonis might know about,
        // for now classes from other non-adonis modules and some odly named classes will not be found

        return atom.notifications.addWarning("No source for module ''" + name + "'' found.");
    };
}

function handleEdge(editor, ranges, dir) {
    let tokenLines = editor.getBuffer().getLanguageMode().tokenizedLines;

    for (let range of ranges) {
        let tokenLine = tokenLines[range.start.row];
        let token = tokenLine.tokenAtBufferColumn(range.start.column);

        if (token.scopes.includes("string.quoted.single.js")) {
            let file = path.resolve(dir, "resources", "views", token.value.replace(/\./g, '/') + ".edge");
            if (fs.existsSync(file)) return atom.workspace.open(file);

            return atom.notifications.addWarning("Source for ''" + token.value + "'' not found at expected location (" + file + ").");
        }

    }
    return atom.notifications.addError("Cannot go to file at this location.");
}

function checkSubModules(dir, name) {
    if (fs.lstatSync(dir).isDirectory()) {
        //Simple check for major classes
        let modDir = path.resolve(dir, name);
        if (fs.existsSync(modDir)) return atom.workspace.open(path.resolve(modDir, "index.js"));

        //Search for lesser classes
        for (modDir of fs.readdirSync(dir)) {
            modDir = path.resolve(dir, modDir);
            if (fs.existsSync(path.resolve(modDir, name + ".js"))) return atom.workspace.open(path.resolve(modDir, name + ".js"));
            checkSubModules(modDir, name);
        }
    }
}

function overlap(a, b) {
    return (a.start >= b.start && a.start <= b.end) || (b.start >= a.start && b.start <= a.end);
}

function getIndex(lookup, range, off) {
    off = off || 0;
    return {
            start: lookup((range.start.row || range.start.line) + off, range.start.column),
            end: lookup((range.end.row || range.end.line) + off, range.end.column)
        };
}

function nodeIs(word) {
    word = word || 'require';

    return node => {
            let c = node && node.callee;
            return c && c.name === word && c.type === 'Identifier' && node.type === 'CallExpression'
        };
}
