# adonis-resolver

Atom plugin to jump to either a module's file from its use or make statement in a Javascript file or an included template from it's @[!]component/@include/@extends/@layout statement in an Edge file.
NOTE: The grammar for Edge files is not included in this plugin, so to follow links in them a plugin such as [Edge](https://atom.io/packages/edge) is needed.

## Usage

1. Move your cursor to the textual portion of the statement to resolve.
2. Open the command palette and run the "Adonis Resolver: Open Selected Dependencies" command.
3. The selected file will open.

If you'd like to add a shortcut for this, I'd recommend adding the following
to your `keymap.cson`:

``` cson
'.workspace':
  'ctrl-alt-o': 'adonis-resolver:open-selected-dependencies'
```

Alternatively, you can use Hyperclicking on a statement to do the above more quickly.

# License

MIT. See [LICENSE.md](http://github.com/cooliojazz/atom-adonis-resolver/blob/master/LICENSE.md) for details. -->
