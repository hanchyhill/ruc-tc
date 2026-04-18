# FNV3 数据下载、解析与聚类说明

本文档对应 `FNV3` 相关 Node.js 代码，覆盖以下流程：

- 下载 FNV3 多种产品（ATCF、paired CSV、cyclogenesis CSV）
- 解析 CSV 并转换为项目统一 JSON 结构
- 对西北太平洋（`WP`）扰动进行 DBSCAN 聚类
- 结果入库 MongoDB（生产环境配置）

---

## 1. 相关代码位置

- 下载与调度入口：`src/fnv3download_csv.js`
- CSV 解析核心：`src/resolve.CSV_fnv3.js`
- 聚类算法核心：`src/lib/cluster.js`
- 本地文件聚类示例脚本：`src/process_fnv3_wp.js`
- PM2 配置：`pm2csv_fnv3.json`

---

## 2. 运行前准备

### 2.1 安装依赖

在项目根目录执行：

```bash
yarn install
```

### 2.2 MongoDB 连接

`src/fnv3download_csv.js` 在启动时会调用 `db/initDB.js` 建立数据库连接，并通过 `save2DB` 写入数据。默认通过 `NODE_ENV=production` 使用生产连接配置。

---

## 3. 整体处理流程

`src/fnv3download_csv.js` 的主流程如下：

1. 根据当前 UTC 时间推断最新模式时次（`00/06/12/18 UTC`）
2. 生成最近 4 个时次列表（间隔 6 小时）
3. 针对每个时次下载：
   - `cyclogenesis.csv`
   - `atcf_a_deck.txt`（ensemble）
   - `atcf_a_deck.txt`（ensemble_mean）
   - `paired.csv`（ensemble）
   - `paired.csv`（ensemble_mean）
4. 对 `cyclogenesis.csv` 执行两套解析：
   - `processFNV3CSVDataEnhanced`：按风暴/轨迹分组的增强解析
   - `processFNV3CSVData`：基础解析（单条轨迹格式）
5. 对基础解析结果执行 `processWPCycloneCluster` 聚类
6. 将增强解析结果和聚类结果写入 MongoDB

脚本还会通过 `node-schedule` 每 20 分钟轮询一次。

---

## 4. 下载文件与存储路径

### 4.1 远端下载地址规则

代码中镜像地址前缀为：

`http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3`

会组合不同子路径下载产品：

- `/ensemble/paired/atcf/..._atcf_a_deck.txt`
- `/ensemble_mean/paired/atcf/..._atcf_a_deck.txt`
- `/ensemble/paired/csv/..._paired.csv`
- `/ensemble_mean/paired/csv/..._paired.csv`
- `/ensemble/cyclogenesis/csv/..._cyclogenesis.csv`

### 4.2 本地保存根目录

由系统平台决定（`src/fnv3download_csv.js`）：

- Windows：`\\10.148.44.81\data_hpc\typhoon\fnv3`
- Linux：`/var/www/html/data/cyclone/fnv3`

文件最终会按 `类型/YYYY_MM/文件名` 组织，例如：

`csv_cyclogenesis/2026_04/FNV3_2026_04_18T00_00_cyclogenesis.csv`

---

## 5. CSV 解析逻辑（`resolve.CSV_fnv3.js`）

### 5.1 数据清洗

- 先找到 `# BEGIN DATA` 行，仅保留之后的数据
- 移除空行和注释行（`#` 开头）
- 按表头将每一行映射为对象字段

### 5.2 关键字段映射

主要输入字段包括：

- `track_id`
- `init_time`
- `valid_time`
- `sample`（集合成员号）
- `lat` / `lon`
- `maximum_sustained_wind_speed_knots`
- `minimum_sea_level_pressure_hpa`

转换后的轨迹点为统一格式：

`[step小时, [lon, lat], pres(hPa), wind(m/s)]`

说明：

- `step = valid_time - init_time`（小时）
- 风速由节转换为米每秒：`knots * 0.5144`

### 5.3 解析输出方法

提供两种方法：

- `processFNV3CSVData`（basic）  
  基础方式，逐条转换并输出统一格式
- `processFNV3CSVDataEnhanced`（enhanced）  
  先按 `track_id` 分组，再合并同一风暴的多成员数据，输出更完整的风暴对象

---

## 6. 聚类逻辑（`lib/cluster.js`）

函数：`processWPCycloneCluster(cycloneDataList, options)`

### 6.1 聚类输入筛选

仅保留：

- `basinShort2 === "WP"`（西北太平洋）
- `cycloneNumber` 以 `I` 开头（扰动编号）

### 6.2 特征构建

从每条轨迹中取首个点（即初始时刻），构造 3D 点：

- `x = lon`
- `y = lat`
- `z = step * 20 / 110`

即：`point = [lon, lat, step_axis]`

### 6.3 DBSCAN 参数

默认参数：

- `epsilon = 10`
- `baseMinPoints = 4`

实际 `minPoints` 会根据样本数自动限制在合理范围（至少 2，不超过样本数）。

### 6.4 聚类结果

- 每条成员轨迹被赋予 `clusters_id`
- 噪声点记为 `9999`
- 按 `clusters_id` 回填并重组轨迹
- 输出增强结构 `tracks_list_enhanced`，包含聚类后的“类风暴”对象

---

## 7. 如何运行

### 7.1 直接运行（推荐调试）

```bash
node src/fnv3download_csv.js
```

功能：

- 启动时立即执行一次下载+解析+聚类+入库
- 后续每 20 分钟自动轮询

### 7.2 PM2 常驻运行

```bash
pm2 start pm2csv_fnv3.json
```

日志输出：

- 标准输出：`logs/fnv3-csv-out.log`
- 错误输出：`logs/fnv3-csv-err.log`

---

## 8. 本地离线聚类测试

如果你已经有 `demo/fnv3_basic_result.json`，可单独运行：

```bash
node src/process_fnv3_wp.js
```

会输出以下文件到 `demo/`：

- `cyclones_WP_list.json`
- `track0_info_list.json`
- `tracks_list.json`
- `tracks_list_cluster_enhanced.json`

---

## 9. 常见问题排查

- 下载失败  
  检查镜像站是否可访问、目标时次文件是否发布。

- 文件重复下载问题  
  代码已通过 `checkFileExists` 跳过已存在文件；注意确认保存目录是否一致。

- 数据为空/解析失败  
  检查 CSV 是否包含 `# BEGIN DATA` 标记，字段名是否与解析代码一致。

- 聚类结果全是 `9999`  
  可能样本过少、点分散度过大或时次混杂，可尝试调整 `epsilon` 与 `baseMinPoints`。

---

## 10. 备注

- 本文档聚焦 FNV3 的 **下载、CSV解析、WP聚类** 代码链路。
- 如果需要补充 ATCF 解析说明，可另加 `src/fnv3download.js` 与对应解析器文档。
