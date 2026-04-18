# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

台风集合预报数据采集、解析、处理与可视化系统。从多个气象预报机构（FNV3、AIFS、EMC、RUC/NCEP等）获取台风集合预报数据，解析ATCF和CSV格式，进行聚类分析，存储至MongoDB，并用Python绘制路径图。

## 常用命令

### 安装依赖
```bash
yarn install
pip install -r python/requirements.txt  # 或 conda install -c conda-forge cartopy matplotlib numpy
```

### 通过PM2运行各数据源下载服务
```bash
pm2 start pm2fnv3.json      # FNV3 ATCF数据下载
pm2 start pm2csv_fnv3.json  # FNV3 CSV数据下载
pm2 start pm2emc.json       # EMC多机构数据下载
pm2 start pm2aifs_cai.json  # AIFS集合预报下载
pm2 start pm2ruc.json       # RUC数据下载
```

### 直接运行脚本（cwd为src/）
```bash
node src/fnv3download.js         # FNV3 ATCF下载
node src/fnv3download_csv.js     # FNV3 CSV下载与解析
node src/process_fnv3_wp.js      # WP盆地数据过滤与聚类
node src/emcDownload.js          # EMC数据下载
node src/aifsDownload_cai.js     # AIFS数据下载
```

### Python可视化
```bash
cd python && python draw_fnv3_track.py
# 输出至 python/output/
```

### 生成文档
```bash
npm run buildDoc
```

## 架构

### 数据流水线

```
数据源(FNV3/AIFS/EMC/RUC) → 下载模块 → 解析模块 → 统一JSON格式 → 处理/聚类 → MongoDB存储
                                                                    ↓
                                                              Python可视化
```

### 核心模块（src/）

- **下载模块**: `fnv3download.js`, `fnv3download_csv.js`, `emcDownload.js`, `aifsDownload_cai.js`, `newDownload.js` — 各数据源的定时下载（使用node-schedule调度）
- **解析模块**: `newResolveTCFA_fnv3.js`, `resolve.CSV_fnv3.js`, `lib/emc_TCFA.js`, `lib/get_aifs.js` — 将ATCF文本/CSV/API响应解析为统一JSON
- **处理模块**: `process_fnv3_wp.js` — 过滤WP（西北太平洋）盆地气旋，提取轨迹初始点，执行DBSCAN聚类
- **聚类**: `lib/cluster.js` — 基于sdbscan库的DBSCAN聚类，三维点坐标 `[lon, lat, step*20/110]`，epsilon=10, minPoints=4
- **配置**: `insConfig.js` — 各预报机构（NCEP/FNV3/EMC/UKMO/CMC/FNMOC/EC）的集合成员解析规则
- **数据库**: `db/initDB.js` + `db/schema/db.schema.js` — MongoDB连接与Mongoose数据模型

### Python模块（python/）

- `draw_fnv3_track.py` — 使用cartopy+matplotlib绘制台风路径图，读取 `demo/fnv3_enhanced_result.json`

### 数据格式

track数组中每个点的结构: `[时效小时, [经度, 纬度], 气压hPa, 风速m/s]`

tcID为唯一标识，格式示例: `2025092718_I-01EP_I-01_fnv3-gen`

### 机构配置映射

`insConfig.js` 中 `selectConfig(ins)` 接受的参数: `ecmwf`, `ncep`, `ncep_e`, `ukmo`, `ukmo_e`, `cmc`, `cmc_e`, `fnmoc`, `fnmoc_e`, `fnv3`, `fnv3-gen`。后缀 `_e` 表示EMC数据源变体。

## 数据库

- 本地: `mongodb://localhost:12345/cyclones`
- 生产: `mongodb://10.148.16.20:20186/cyclones`（用户 `rwTC`）

## 注意事项

- PM2配置中 `cwd` 设为 `./src/`，脚本中的相对路径基于src目录
- 支持Windows和Linux双平台部署，文件保存路径在各下载模块中硬编码区分
- 所有响应请使用中文
