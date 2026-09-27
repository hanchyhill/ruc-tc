# FNV3 成员编号排他性聚类方案

本文是对[旧版自动聚类算法](FNV3_自动聚类算法原理.md)的成员排他改进。实现位于 `src/lib/cluster_member_exclusive.js`；`src/lib/cluster.js` 是默认使用新版的兼容入口，原实现保存在 `src/lib/cluster_legacy.js`。设置环境变量 `FNV3_CLUSTER_ALGORITHM=legacy` 并重启进程即可回退。目标是：同一次起报、同一数据源的每个风暴簇中，每个集合预报成员至多贡献一条路径。一个成员可以同时预报不同风暴，因此相同成员编号允许出现在不同簇中。

## 1. 数据与不可违反的约束

- CSV 的 `sample` 是集合成员编号。`src/resolve.CSV_fnv3.js` 目前用 `Math.round(Number(sample))` 生成轨迹的 `ensembleNumber`；分组前应确认 `sample` 为有效整数，避免不同原始值经四舍五入后误变成同一个编号。
- 排他性按 `(ins, initTime, ensembleNumber)` 的同一批次和同一风暴簇判断。不同起报时间的同号成员不能混在一次聚类中；不同风暴簇可以各有一个同号成员。
- 每条轨迹需要独立、稳定的内部 `trackId`，例如输入数组索引或 CSV 的 `track_id + sample + init_time`。不能仅用当前的 `tcID + ensembleNumber` 回填：同号轨迹可能在同一气旋对象中重复，这个键会覆盖先前结果。
- 正式风暴簇的最终输出必须满足 `tracks.length === new Set(tracks.map(t => t.ensembleNumber)).size`。未归属路径另汇总到 `C-9999` 风暴对象以兼容入库；该对象是待定路径容器，不受成员编号排他约束。

## 2. 路径相似性的定义

现有 DBSCAN 使用首点三维距离，适合作为候选簇的粗筛。遇到同号成员冲突时，用**整条路径**比较候选轨迹与簇内其他编号的轨迹：

1. 将每个轨迹点变为 `(有效时间, 经纬度)`；有效时间为 `initTime + step`。两条轨迹统一到 6 小时 UTC 网格，在相同有效时间比较。仅在原轨迹相邻点间隔不超过可配置上限（建议先取 12 小时）时做线性插值，不外推到轨迹范围外。经度插值应按跨 180° 经线的最短方向进行。
2. 在每个共同时间使用局部平面欧氏距离：`dx = R × cos(平均纬度) × Δlon`、`dy = R × Δlat`、`d_t = √(dx² + dy²)`，角度先转弧度，`R = 6371 km`。经度差取跨 180° 经线的最短方向，距离单位为千米。这是轨迹中心的近似水平距离，不是经纬度数值直接相减。
3. 至少有 3 个共同时间点、首末共同点相隔至少 12 小时，且 `coverage = 共同网格点数 / min(两条轨迹各自的有效网格点数)` 不低于 40%，才认为两条路径**可比较**。这些值先作为可调默认值，需用实际样本校准。
4. 对可比较轨迹定义 `D(a,b) = median(d_t) + 0.5 × P80(d_t) + 200 × (1 − coverage)`，单位为千米。中位数衡量整体位置，第 80 百分位惩罚部分时段明显分离，覆盖惩罚防止只凭短暂交会判为相似。风速和气压暂不进入主分数，以免缺测或强度偏差盖过路径一致性。

同号冲突时，仅使用**其他成员编号**作为参考，且一条参考路径只有在 `D(a,b)` 不超过相似性上限时才算有效支持。候选至少需要 2 条不同编号的有效参考路径；先比较有效支持数，支持数相同再比较这些有效路径的 `D(a,b)` 中位数。若分差过小，则比较路径覆盖率；仍无法区分就暂缓该编号。这样原簇包含多条不同风暴路径时，远离候选的路径不会把两个候选一同否决。

当前实现的可调默认值为路径分数上限 `maxPairScoreKm = 900`、候选最小分差 `minScoreMarginKm = 75`。这些值是用仓库样例做初步对照的工程参数，仍需根据人工核对样本标定，不能直接解释为“同一台风”的物理界限。

## 3. 首轮聚类与冲突消解

第一轮沿用现有首点 DBSCAN 产生候选簇。**若旧簇内没有重复成员编号，直接保留整个簇**，不再因整段路径分散而拆分；路径相似性只用于同号成员的取舍和待选轨迹的后续归属。出现同号冲突的候选簇按以下顺序处理：

1. 按 `ensembleNumber` 分组。出现次数为 1 的轨迹先作参考；次数大于 1 的编号形成冲突组。
2. 对每个冲突组，计算各候选与其他编号参考轨迹的有效支持数及路径距离。优先保留支持数最多的候选；支持数相同时保留距离更小、且达到分差要求的一条。其余移入待选池。候选分数接近时，先比较覆盖率；仍无法区分则整个冲突组暂缓，不靠输入顺序任意选一条。
3. 多个编号同时冲突时，逐组更新参考集合，再复查先前的选择；直到没有选择变化，或达到配置的有限迭代次数。这样一次冲突的取舍可以利用其他冲突组最终留下的路径。
4. 若没有足够的非冲突参考轨迹，先找**不同成员编号之间**相似度最高、且达到最低时长和相似性要求的一对作为种子，再逐条加入兼容轨迹。若连种子都找不到，该候选簇不成立，全部转入待选池。
5. 冲突筛选后的簇若达到最低**不同成员编号数**（默认 4），即可保留。没有冲突的首轮旧簇沿用原 DBSCAN 的判定，即使小于 4 条也原样保留。这里按不同成员数计数，重复编号不能凑足密度门槛。

上述选择属于局部启发式：有多个冲突编号时，逐组选择不一定得到全局最优组合。可用“替换一条已选轨迹后，簇内总体路径差是否下降”做局部改进；若实际数据中多组冲突很常见，再考虑带每编号至多一条约束的全局优化。

例如候选簇含成员 `3、7A、7B、12、19`，其中 `7A` 与 `3、12、19` 的路径距离分数为 140 km，`7B` 为 430 km，且前者满足覆盖率、相似性阈值和最小分差，则该簇保留 `7A`，将 `7B` 放入待选池。若 `7B` 与另一簇接近且该簇没有成员 7，后续轮次可把它分配给另一簇；若无合适归属，保持待定。

## 4. 待选池的跨簇分配与一次重新聚类

被排除的路径、原 DBSCAN 噪声和未通过首轮门槛的路径先进入待选池。**先逐条尝试归入已有簇，全部比较完成后才对剩余路径运行一次原有的首点 DBSCAN**：

1. 对待选轨迹 `A` 和某个已有簇 `C`，计算它与 `C` 中各条参考路径的 `D(A,b)`。`D` 不超过 `maxPairScoreKm` 的路径记为相似路径；`相似占比 = 相似路径数 / 参考路径总数`。同时要求相似路径至少 2 条、相似占比至少 `minReassignmentFraction = 25%`。若 `A` 原本从某簇剔除，本轮不让它直接回到该簇。
2. 若 `C` 中没有 `A` 的成员编号，满足上述条件即可成为候选目标。若有同号成员 `B`，分别相对 `C \ {B}` 计算 `A` 和 `B` 的相似占比及相似路径距离；只有 `A` 的占比更高，或占比相同但距离中位数至少改善 `minScoreMarginKm = 75 km`，才用 `A` 替换 `B`。被换出的 `B` 回待选池，本次跨簇分配不再重新处理它，避免 A/B 反复交换。
3. 多个目标簇都满足时，优先选择相似占比更高、相似路径距离更低的簇；若前两名占比相同且距离分差不足 75 km，则保持待定。按输入顺序处理待选轨迹，后面的轨迹能看到前面已完成的分配。
4. 把仍在待选池中的轨迹（包括旧噪声和换出的成员）一起运行一次与旧版相同的首点 `sdbscan(pointList, epsilon, minPoints)`。对新候选簇再次消除同号冲突。新簇最终少于 `minNewClusterMembers = 5` 条不同成员轨迹，就不输出独立风暴簇，全部留在 `unassignedTracks`。
5. `unassignedTracks` 保留每条轨迹及原因，当前可见 `duplicate_member`、`small_new_cluster`、`insufficient_support`、`insufficient_overlap`、`no_matching_cluster`、`invalid_track`、`invalid_member`。同一数据源、同一起报时间的待定路径还汇总为一个 `C-9999` 风暴对象，沿用原有入库流程；具体原因仍可在 `unassignedTracks` 中核对。

伪代码：

```text
initialProposals = 原有 DBSCAN(全部 WP 扰动轨迹的首点)
clusters, pool = 对 initialProposals 仅做成员编号冲突筛选
pool += 原有 DBSCAN 噪声
pool = 尝试将 pool 逐条归入其他已有 clusters；必要时替换同号成员
newProposals = 原有 DBSCAN(pool 的首点)
newClusters = 对 newProposals 做成员排他筛选，仅接收至少 5 个不同成员的簇
return clusters + newClusters, unassignedTracks = 剩余 pool
```

实现时每条轨迹只能处于一个已确认簇或待选池；已有簇不再整体重新聚类。最终再按确定性规则分配展示用簇编号，避免 DBSCAN 的临时编号在各轮冲突。

## 5. 验收要点

- 任意正式风暴簇内没有重复 `ensembleNumber`；同号轨迹可分别属于不同风暴簇。`C-9999` 是未归属容器，允许同号轨迹。
- 所有输入轨迹恰好出现在一个正式输出簇或 `unassignedTracks` 中，不丢失、不重复；`C-9999` 是 `unassignedTracks` 的入库副本。
- 对同号候选 A、B，若 A 与其他成员在共同有效时间上的路径明显更接近，则保留 A；B 后续仍可进入另一个合适的簇。
- 同号候选路径没有足够重叠、多个候选难以区分、或待选池人数不足时，不强行决定冲突或生成新簇，并说明原因；无同号冲突的首轮旧簇保持完整。
- 对跨 180° 经线、不同轨迹起始时效、短轨迹与空轨迹分别检查相似性与待定输出。

## 6. 运行与对照

直接用仓库中的基础解析结果打印新旧汇总：

```bash
node src/compare_fnv3_wp_cluster.js
```

指定输入和输出目录可保存 `summary.json`、`old.json` 和 `member_exclusive.json`。输入支持基础解析 JSON 或原始 cyclogenesis CSV；输出目录可自行选择。第三个参数可以传 JSON 配置文件覆盖新算法的默认参数：

```bash
node src/compare_fnv3_wp_cluster.js demo/fnv3_basic_result.json demo/cluster_comparison
node src/compare_fnv3_wp_cluster.js demo/fnv3_basic_result.json demo/cluster_comparison options.json
```

现有调用继续使用 `src/lib/cluster.js` 的 `processWPCycloneCluster(data, options)`，默认执行新版；也可直接调用 `processWPCycloneClusterMemberExclusive(data, options)`。返回字段沿用旧版的 `cyclones_WP_list`、`track0_info_list`、`tracks_list`、`tracks_list_enhanced`、`clusterStats`，并增加 `unassignedTracks`。新函数不修改输入。`tracks_list` 的成员包含内部 `trackId`，用于核对逐条归属；增强格式仍保持原有数据库对象结构。

可离线打开的交互式对比页位于 `doc/fnv3_cluster_comparison.html`。页面包含左右同步的轨迹地图、旧簇到新簇的流向矩阵、成员筛选、轨迹明细和簇内路径分散度。更换输入后重新生成：

点击左图图例、矩阵行标题或清单中的旧簇编号，会在左图突出该旧簇，并在右图按新版簇或待定状态分别着色；点击新版簇编号则反向显示它在旧版的来源。未选中的轨迹淡化作为地理参照，图上方的流向标签列出每个去向或来源的轨迹数。

```bash
node src/build_fnv3_cluster_visualization.js [基础解析 JSON 或 cyclogenesis CSV] [输出 HTML] [可选的参数 JSON]
```

不传参数时使用仓库的 `demo/fnv3_basic_result.json`，更新 `doc/fnv3_cluster_comparison.html`。HTML 内嵌数据与绘图脚本，可直接作为本地文件打开；其中“是否合理”的路径距离指标只用于辅助人工审查，不能替代真实风暴归属标签。

当前实现会检查输出轨迹总数、唯一归属和簇内成员编号唯一性。由于旧 CSV 解析器已将 `sample` 四舍五入，新函数只能验证解析后的 `ensembleNumber` 是非负整数；若将来要拒绝原始 CSV 中非整数的 `sample`，需在解析阶段另行调整。

默认入口保持旧调用签名和增强风暴对象结构，继续提供 `clusterStats.noise` 与首点、源轨迹的 `clusters_id`；未归属路径在这些元数据中标为 `9999`，同时作为独立的 `unassignedTracks` 返回，并按数据源和起报时间组合成 `C-9999` 增强风暴对象写库。`clusterStats.clusters` 仅统计正式簇。对比脚本始终直接读取 `cluster_legacy.js`，不受回退环境变量影响。
