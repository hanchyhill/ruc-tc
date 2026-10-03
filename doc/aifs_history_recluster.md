# AIFS 历史数据库重聚类

参照 FNV3 历史回算流程，处理 `ins=aifs-cai`、`basinShort2=WP` 的历史数据。默认预览全部已存储的 `IC*` 或 `C-*` 时次，不设 FNV3 的日期截止限制。

```powershell
# 正式数据库预览（不写入）
node scripts/recluster-aifs-history.js --production

# 正式回算：逐批备份、写入校验、清理失效簇
node scripts/recluster-aifs-history.js --production --apply --delay-ms 1000

# 只回算仍有 IC* 的时次，并清理原 IC*
node scripts/recluster-aifs-history.js --production --apply --raw-only --delay-ms 1000

# 指定 UTC 范围，包含起点，不包含终点
node scripts/recluster-aifs-history.js --production --apply --start 2026-09-01 --before 2026-10-03

# 测试
npm run test:aifs-history
```

支持 `--backup-dir` 指定备份目录；默认使用仓库旁的 `ruc-tc-backups`。不加 `--production` 时沿用 `NODE_ENV` 和现有数据库配置。起止日期格式为 `YYYY-MM-DD` 或 `YYYY-MM-DDT00/T06/T12/T18`，均按 UTC 解析。

实时下载 `src/aifsDownload_cai.js` 保持原有文件判重：按起报时次和区域判断本地文件是否存在，存在则跳过下载和入库，与气旋编号无关。新数据入库时检测 WP / IC*；存在时使用该时次全部 IC* 轨迹重算，完整替换旧 C-* 簇（成员数量相同或减少也会更新），校验后清理失效簇和旧 IC*；不存在时走普通入库流程。实时备份保存在 AIFS 数据目录的 `recluster_backups` 子目录。已有文件对应的历史数据可通过历史脚本回算。

每个时次优先使用原始 `IC*` 数据；没有原始数据时，展开已生成的 `C-*` 数据（包含 `C-9999`）重算。原始 `IC*` 在备份且新簇写入、清理校验成功后删除，并检查是否有残留。非 `IC` 的 `I*`、正式编号台风和其他机构、海域记录保持不变。新簇从 `C-00` 开始，无法聚类的轨迹放入 `C-9999`，同步生成 `cycloneName` 和 `tcID`，设置 `fillStatus=2`。历史回算固定使用 member-exclusive 算法，不受实时流程的 `FNV3_CLUSTER_ALGORITHM=legacy` 开关影响。

每批核对轨迹内容及数量，备份该时次全部 WP 原记录为拼接 BSON，保留 ObjectId、Date 及原字段；随后写入、校验新簇，再删除失效旧簇并再次校验。重复执行会替换相同 tcID。已经从历史数据中丢失的轨迹无法恢复。

回算不是数据库事务。写入失败会停止并提供备份路径与续跑起点；失败可能留下部分新簇。先恢复该批备份，再按日志的 `--start` 续跑，尤其是只有 `C-*` 的批次，以免将部分新旧簇混合作为输入。执行回算期间应暂停其他会写入相同历史时次的进程。
