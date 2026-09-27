# FNV3 自动聚类算法原理（旧版实现）

本文记录旧版算法的实际行为，供优化和回退时对照。旧实现已移至 `src/lib/cluster_legacy.js`，核心函数仍为 `processWPCycloneCluster(cycloneDataList, options)`。默认入口 `src/lib/cluster.js` 现在使用成员编号排他算法；设置环境变量 `FNV3_CLUSTER_ALGORITHM=legacy` 可切回本文件所述的旧算法。在线流程由 `src/fnv3download_csv.js` 在解析 cyclogenesis CSV 后调用，离线示例入口是 `src/process_fnv3_wp.js`。

## 1. 输入与筛选

输入是基础解析后的气旋对象数组。每个对象包含 `tcID`、`basinShort2`、`cycloneNumber`、`initTime` 和 `tracks`；每条成员轨迹包含 `ensembleNumber`、`fcType` 和 `track`。轨迹点的前四项依次为 `[step, [lon, lat], pres, wind, ...]`，其中解析器生成的 `step` 是 `valid_time - init_time` 的小时数。

算法仅保留 `basinShort2 === 'WP'` 且 `cycloneNumber` 首字符为 `I` 的气旋。每条非空成员轨迹只提取 `track[0]` 作为一个聚类样本，同时保存 `tcID` 和 `ensembleNumber` 供结果回填。`pres`、`wind` 会进入首点信息表，但不参与聚类距离计算。输入中的其他气旋不进入此次聚类输出。

## 2. 特征与距离

对每条入选轨迹的首点构造三维向量：

```text
p = [lon, lat, step × 20 / 110]
```

`lon`、`lat` 直接采用经纬度数值；第三维按固定系数把小时数缩放到与经纬度数值相近的尺度。这是代码中的经验权重，并非按实际地表距离进行的换算。

当前依赖 `sdbscan`（`package.json` 声明 `^0.3.3`）对这些向量计算欧氏距离：

```text
d(p, q) = √[(lonₚ − lonᵩ)² + (latₚ − latᵩ)²
              + ((stepₚ − stepᵩ) × 20 / 110)²]
```

距离单位是上述混合特征空间的数值单位，不是千米。实现没有进行球面距离计算、经度环绕处理或纬度相关的经度缩放。

## 3. 密度聚类

调用形式为 `sdbscan(pointList, epsilon, minPoints)`，默认 `epsilon = 10`、`baseMinPoints = 4`。实际最少点数按样本数 `N` 计算：

```text
minPoints = max(2, min(baseMinPoints, N))
```

`epsilon` 是三维空间中的邻域半径。DBSCAN 从一个样本出发，若其半径内的样本数达到 `minPoints`，就建立簇，并沿其他满足该条件的样本扩展；未进入簇的样本作为噪声。依赖库的邻域查询把当前点计入邻域，返回的簇 ID 从 `0` 开始。若只有一个样本，`minPoints` 仍为 `2`，该样本会成为噪声。若没有非空轨迹，则跳过 DBSCAN。

这里使用的 `sdbscan` 版本在邻域查询时会跳过已经访问过的其他点。因此其扩展结果可能受样本顺序影响；优化时应以该依赖的实际输出为基准，不宜直接假定它与其他 DBSCAN 实现完全等价。

## 4. 回填、聚合与输出

函数先把所有首点的 `clusters_id` 初始化为 `9999`，然后按 `sdbscan` 返回的簇和噪声赋值。之后用 `tcID + '__' + ensembleNumber` 作为键，将簇 ID 回填到原成员轨迹；找不到对应首点的轨迹（例如空轨迹）也分配 `9999`。这一步会给传入的轨迹对象增加 `clusters_id` 属性。

所有入选轨迹按 `clusters_id` 聚合成 `tracks_list`，按数字 ID 升序排列。每个分组再转换为增强对象：`cycloneNumber = C-<两位起补零的簇 ID>`，`cycloneName = cycloneNumber + basinShort2`，`tcID` 由首条成员轨迹的初始化时间、名称、编号和 `ins` 拼接而成；`memberCount` 是分组内轨迹数，`tracks` 保留各成员的 `fcType`、`ensembleNumber` 和完整轨迹。转换后的 `tracks_list_enhanced.data` 是在线流程写库的数据。

函数同时返回 `cyclones_WP_list`、`track0_info_list`、`tracks_list`、`tracks_list_enhanced` 和 `clusterStats`。`clusterStats.clusters`、`clusterStats.noise` 分别是依赖库返回的簇数和噪声点数；增强结果中的 `stormGroups` 是输出分组数。

## 5. 旧版实现的边界

- 只比较轨迹首点的位置与 `step`，后续路径、移动方向、强度及轨迹间持续接近程度均不参与判定。相近首点的轨迹可被分在一起，即使后续路径分离。
- `9999` 是聚合用的统一噪声编号：多个互不相近的噪声轨迹会被合成一个增强对象；它不代表 DBSCAN 识别出的风暴簇。因此输出分组数可能包含这个噪声组。
- 回填键仅由 `tcID` 和 `ensembleNumber` 组成。若同一气旋对象中有重复的成员编号，映射会覆盖先前的簇 ID。
- 簇编号由本次输入的处理顺序和依赖库生成，不能视作跨批次稳定的风暴标识。
- 当所有入选轨迹均为空时，不调用聚类，也不生成分组；若同时存在非空和空轨迹，空轨迹进入 `9999` 组。

实现依据：`src/lib/cluster_legacy.js`、`src/resolve.CSV_fnv3.js`、`src/fnv3download_csv.js`，以及已安装的 `node_modules/sdbscan/main.js`、`distance.js`。
