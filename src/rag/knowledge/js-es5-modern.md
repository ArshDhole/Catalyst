# ES5 / legacy Node → modern JavaScript migration knowledge

## Declarations
- `var` becomes `const` by default; use `let` where reassignment happens. Check loop closures capturing `var`.

## Functions
- Anonymous `function` expressions often become arrow functions, but NOT when the code relies on dynamic `this`, `arguments`, or prototype methods.
- `function Name()` constructors generally stay unless the target uses classes.

## APIs
- `arr.indexOf(x) !== -1` becomes `arr.includes(x)`.
- String concatenation building HTML/URLs is a candidate for template literals.
- `var self = this` workarounds disappear with arrows.

## Modules
- CommonJS `require(...)` becomes `import ... from '...'` and `module.exports =` becomes `export default` (or named exports). Mixed CJS/ESM needs interop review: default-import of a CJS module.
- `__dirname` / `__filename` have no ESM equivalent; use `import.meta.url` with `fileURLToPath`.

## Node upgrades (10/12/14 → 18/20)
- Old `new Buffer(...)` becomes `Buffer.from(...)` / `Buffer.alloc(...)`.
- Check native addons (node-gyp) — they must rebuild for the new ABI.
- `url.parse` is legacy; prefer the WHATWG `URL` class.
- OpenSSL 3 (Node 17+) breaks old crypto defaults (md4 for webpack 4/5 hashes) — set `NODE_OPTIONS=--openssl-legacy-provider` as a bridge, then upgrade bundlers.

## Validation checklist
- Run the test suite on the target Node version; grep for `var `, `.indexOf(`, `require(`, `module.exports`, `new Buffer(` leftovers.
