# Prompt Tower benchmark report (standard)

Generated: 2026-04-13T20:32:15.414Z
Fixture: 1536 total files, 384 selected files
Fixture bytes: 26939127 total, 6728844 selected, largest file 17756, deepest path 14 segments

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 17.00 | 18.20 | 15.52 | 18.20 | 6 |
| tree:selected | 1.63 | 1.87 | 1.44 | 1.87 | 6 |
| tree:full | 5.83 | 9.77 | 4.28 | 9.77 | 6 |
| tokens:legacy-full | 725.59 | 766.25 | 706.71 | 766.25 | 6 |
| tokens:selected | 186.63 | 220.61 | 173.93 | 220.61 | 6 |
| tokens:full | 698.21 | 727.41 | 666.17 | 727.41 | 6 |
| tokens:warm-full | 688.45 | 715.20 | 668.98 | 715.20 | 6 |
| context:selected-tree | 28.61 | 30.57 | 27.05 | 30.57 | 6 |
| context:full-tree | 31.48 | 33.73 | 30.05 | 33.73 | 6 |
| context:minified-full-tree | 23.99 | 25.36 | 22.80 | 25.36 | 6 |

## Comparison To Previous Latest

| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |
| --- | ---: | ---: | ---: | ---: |
| file-blocks:selected | +10.72 | +170.54% | +9.67 | +113.38% |
| tree:selected | +1.35 | +480.89% | +1.43 | +325.57% |
| tree:full | +5.17 | +788.76% | +9.06 | +1266.16% |
| tokens:legacy-full | +667.64 | +1152.12% | +699.18 | +1042.53% |
| tokens:selected | +172.77 | +1246.46% | +206.21 | +1431.38% |
| tokens:full | +639.47 | +1088.74% | +665.23 | +1069.84% |
| tokens:warm-full | +634.22 | +1169.69% | +658.80 | +1168.12% |
| context:selected-tree | +22.24 | +349.20% | +24.03 | +367.46% |
| context:full-tree | +24.29 | +337.96% | +26.08 | +341.15% |
