# FNV3 历史数据库重聚类

覆盖 `fnv3-gen`、`WNV3`、`fnv3`，默认处理数据库全部 `initTime < 2026-09-28T00:00:00Z` 的西北太平洋扰动时次（UTC，不包含 9 月 28 日）。沿用现有 member-exclusive 算法，历史回算不受 `FNV3_CLUSTER_ALGORITHM=legacy` 影响。

```powershell
# 正式数据库预览：不写入
node scripts/recluster-fnv3-history.js --production

# 正式数据库回算：每批 BSON 备份、写入校验、删除失效簇
node scripts/recluster-fnv3-history.js --production --apply --delay-ms 1000

# 指定机构及续跑起点，起点包含在内
node scripts/recluster-fnv3-history.js --production --apply --ins WNV3 --start 2026-09-27T12

# 回算 fnv3-gen 中仍有 I* 原数据的时次，验证成功后删除原 I* 记录
node scripts/recluster-fnv3-history.js --production --apply --ins fnv3-gen --raw-only --remove-raw --delay-ms 1000

# 验证实现
npm run test:fnv3-history
```

不加 `--production` 时沿用 `NODE_ENV` 和项目现有数据库配置。`--before` 为排他上界，不能晚于默认截止时间；`--start` 为包含起点。无起点时自动发现数据库最早时次，不扫描空时次。三种机构分别串行处理，不混合聚类。

存在 `WP / I*` 记录时以其为原始数据，原始记录保持不变。若没有原始记录，则展开全部 `WP / C-*` 记录（包含 `C-9999`）的轨迹重算。CSV 历史入库曾仅保存簇，这种方式可回算数据库仍保有的轨迹；已经在旧入库或算法中丢失的轨迹无法从数据库恢复。正式命名/编号台风和其他海域保持不变。使用原始数据优先策略时不会把旧簇额外混入原始轨迹。

每批先核对轨迹内容与数量，再将该机构、该时次的全部 WP 原记录备份为拼接 BSON（保留 ObjectId、Date 和其他字段）。默认备份目录是仓库旁的 `ruc-tc-backups`，可用 `--backup-dir` 修改。随后替换新簇，验证所有写入内容，清理失效簇并再次验证。重复执行会重算并替换相同 tcID。

`--raw-only` 仅选择含 `I*` 原记录的时次，仍会替换该批旧 `C-*` 簇；`--remove-raw` 在新簇及旧簇清理校验成功后删除已备份、已参与回算的 `I*` 记录，并检查是否有残留。不加此参数时仍保留原始记录。海域范围始终为 WP。

回算不是数据库事务，写入失败可能留下部分新簇；日志会提供 BSON 备份路径、机构和续跑起点。先从备份恢复该批原有 WP 记录再续跑，尤其是无 `I*` 原始记录的批次，避免把部分新旧簇同时当作输入。执行正式回算期间应暂停会写入这些历史时次的其他进程。

备份文件可以通过 MongoDB 工具 `mongorestore` 读取；恢复前需清理对应 `ins + basinShort2=WP + initTime` 范围，并只恢复这一批备份，避免重复 ObjectId。续跑单机构后，其他尚未处理的机构需要单独执行，或重新执行全量命令。
