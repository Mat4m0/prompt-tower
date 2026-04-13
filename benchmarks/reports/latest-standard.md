# Prompt Tower benchmark report (standard)

Generated: 2026-04-13T21:04:17.124Z
Fixture: 1536 total files, 384 selected files
Fixture bytes: 26939127 total, 6728844 selected, largest file 17756, deepest path 14 segments

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 18.85 | 23.43 | 16.50 | 23.43 | 6 |
| tree:selected | 1.16 | 1.42 | 1.00 | 1.42 | 6 |
| tree:full | 4.45 | 5.14 | 3.85 | 5.14 | 6 |
| tokens:legacy-full | 844.61 | 947.70 | 776.14 | 947.70 | 6 |
| tokens:selected | 185.55 | 208.90 | 167.21 | 208.90 | 6 |
| tokens:full | 726.73 | 807.52 | 659.97 | 807.52 | 6 |
| tokens:warm-full | 721.28 | 774.06 | 670.36 | 774.06 | 6 |
| tokens:delta-cached-subtree | 0.07 | 0.09 | 0.06 | 0.09 | 6 |
| tokens:delta-mixed-subtree | 0.06 | 0.07 | 0.06 | 0.07 | 6 |
| context:selected-tree | 28.60 | 31.20 | 26.74 | 31.20 | 6 |
| context:full-tree | 30.66 | 33.08 | 29.27 | 33.08 | 6 |
| context:minified-full-tree | 24.07 | 24.99 | 22.85 | 24.99 | 6 |

## Comparison To Previous Latest

| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |
| --- | ---: | ---: | ---: | ---: |
| file-blocks:selected | +0.79 | +4.35% | +2.16 | +10.13% |
| tree:selected | -0.11 | -8.86% | +0.07 | +5.23% |
| tree:full | +0.13 | +3.06% | -0.01 | -0.22% |
| tokens:legacy-full | +155.23 | +22.52% | +245.69 | +35.00% |
| tokens:selected | +19.08 | +11.46% | +38.87 | +22.86% |
| tokens:full | +63.35 | +9.55% | +104.45 | +14.86% |
| tokens:warm-full | +61.93 | +9.39% | +102.18 | +15.21% |
| tokens:delta-cached-subtree | -203.78 | -99.97% | -223.51 | -99.96% |
| tokens:delta-mixed-subtree | -215.42 | -99.97% | -240.17 | -99.97% |
| context:selected-tree | -2.39 | -7.71% | -5.04 | -13.90% |
| context:full-tree | -1.93 | -5.93% | -2.97 | -8.23% |
| context:minified-full-tree | -1.72 | -6.69% | -5.02 | -16.71% |
