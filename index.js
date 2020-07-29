const path = require('path');
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
            // Does not properly handle the case that a match spans multiple lines, but wordRegExp seems to prevent that anyways.
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

    switch(editor.languageMode.grammar.scopeName) {
        case "source.js":
        case "source.ts": {
            handleJs(editor, ranges, dir);
            break;
        }
        case "text.html.edge": {
            handleEdge(editor, ranges, dir);
            break;
        }
    }
}

function handleJs(editor, ranges, dir) {
    for (let range of ranges) {
        let tokenLine = editor.getBuffer().getLanguageMode().tokenizedLineForRow(range.start.row);
        let token = tokenLine.tokenAtBufferColumn(range.start.column);

        if (token.scopes.includes("string.quoted")) {
            // First if it's a project file
            if (!fs.existsSync(dir + "/package.json")) return atom.notifications.addError("A package.json is required to find project files.");
            let autoloads = JSON.parse(fs.readFileSync(dir + "/package.json")).autoload;
            let parts = token.value.slice(1, -1).split('/');
            for (k in autoloads) parts[0] = parts[0].replace(k, autoloads[k]);
            let name = parts[parts.length - 1];
            let file = path.resolve(dir, parts[0], parts.slice(1, parts.length - 1).join('/'), name + ".js");
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
        }

    }
    return atom.notifications.addError("Cannot go to file at this location.");
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
