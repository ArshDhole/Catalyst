# Python 2 → 3 migration knowledge

## Print
- `print "x"` and `print 'x'` statements become `print("x")` calls.
- Bare `print x` becomes `print(x)`. Trailing-comma `print x,` becomes `print(x, end=" ")`.

## Input
- `raw_input(...)` becomes `input(...)`. Old `input(...)` (eval) has no equivalent; flag for review.

## Integers and division
- `1 / 2` is 0 in Py2, 0.5 in Py3. Use `//` to preserve floor division.
- `long` is gone; `int` covers it. `xrange` becomes `range`.

## Strings and bytes
- Py3 `str` is unicode. `unicode(...)` becomes `str(...)`. `basestring` becomes `str`.
- Byte/string mixing raises TypeError in Py3 — check I/O boundaries, sockets, hashing.

## Dicts
- `d.iteritems()` → `d.items()`, `d.iterkeys()` → `d.keys()`, `d.itervalues()` → `d.values()`.
- `d.has_key(k)` → `k in d`. Dict ordering is insertion order in Py3.7+ (implementation detail in 3.6).

## Exceptions
- `except E, e:` becomes `except E as e:`. `raise E, msg` becomes `raise E(msg)`.

## Imports that moved
- `urllib2` → `urllib.request` (+ `urllib.error`, `urllib.parse`).
- `from StringIO import StringIO` → `from io import StringIO`.
- `import cPickle` → `import pickle`. `import ConfigParser` → `import configparser`.
- Relative imports must be explicit: `import sibling` inside a package becomes `from . import sibling` or `from package import sibling`.

## Iteration behavior changes
- `map`, `filter`, `zip`, `range` return iterators, not lists. Wrap with `list(...)` where the code indexes, lens twice, or mutates.
- `sorted()` and `.sort()` with `cmp=` lose cmp; use `functools.cmp_to_key`.

## Validation checklist
- Run the test suite under Python 3; grep for remaining `print ` statements, `urllib2`, `iteritems`, `raw_input`, `xrange`, `has_key`, `except .*,`.
