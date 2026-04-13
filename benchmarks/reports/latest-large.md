# Prompt Tower benchmark report (large)

Generated: 2026-04-13T20:34:53.521Z
Fixture: 2688 total files, 448 selected files
Fixture bytes: 80910925 total, 13484308 selected, largest file 30467, deepest path 17 segments

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 29.21 | 32.12 | 26.31 | 32.12 | 3 |
| tree:selected | 1.76 | 2.00 | 1.62 | 2.00 | 3 |
| tree:full | 8.40 | 8.55 | 8.16 | 8.55 | 3 |
| tokens:legacy-full | 2139.36 | 2152.48 | 2127.55 | 2152.48 | 3 |
| tokens:selected | 339.15 | 339.39 | 338.87 | 339.39 | 3 |
| tokens:full | 2035.36 | 2040.62 | 2026.67 | 2040.62 | 3 |
| tokens:warm-full | 2036.61 | 2060.12 | 2013.54 | 2060.12 | 3 |
| context:selected-tree | 51.96 | 56.64 | 49.16 | 56.64 | 3 |
| context:full-tree | 57.13 | 57.75 | 56.16 | 57.75 | 3 |
| context:minified-full-tree | 43.77 | 43.96 | 43.61 | 43.96 | 3 |
