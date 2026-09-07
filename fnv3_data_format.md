# FNV3 CSV JSON 数据格式说明

本文档说明 `src/resolve.CSV_fnv3.js` 解析 FNV3 CSV 后生成的统一 JSON 数据格式。

## 1. 适用范围

| 项目 | 说明 |
|---|---|
| 下载入口 | `src/fnv3download_csv.js` |
| 解析模块 | `src/resolve.CSV_fnv3.js` |
| 处理函数 | `processFNV3CSVData`、`processFNV3CSVDataEnhanced` |
| 数据来源 | FNV3 paired/cyclogenesis CSV |
| 时间标准 | UTC |
| 风速单位 | m/s |
| 气压单位 | hPa |
| 距离单位 | m |
| 经纬度单位 | 度 |

> 注意：`src/fnv3download.js` 使用的是 ATCF 文本解析链路；本文档针对 `src/resolve.CSV_fnv3.js` 的 CSV 解析结果。CSV 链路会生成 `rmw` 和 `windRadiusInfo` 风圈字段。

## 2. 完整 JSON 示例

```json
{
  "method": "enhanced",
  "stormGroups": 1,
  "originalCount": 2,
  "processedCount": 1,
  "data": [
    {
      "basinShort2": "WP",
      "cycloneName": "01WP",
      "cycloneNumber": "01",
      "ins": "fnv3-gen",
      "initTime": "2025-09-27T18:00:00.000Z",
      "tcID": "2025092718_01WP_01_fnv3-gen",
      "tracks": [
        {
          "fcType": "ensembleForecast",
          "ensembleNumber": 0,
          "track": [
            [
              18,
              [140.2, 15.6],
              985.4,
              25.72,
              45000,
              [
                [18, 120000, 100000, 80000, 110000],
                [26, 60000, 45000, 30000, 50000],
                [33, 25000, 20000, 12000, 22000]
              ]
            ],
            [
              24,
              [141.1, 16.2],
              982.1,
              27.78,
              48000,
              [
                [18, 130000, 105000, 85000, 115000],
                [26, 65000, 48000, 35000, 55000]
              ]
            ]
          ]
        }
      ],
      "controlIndex": 0,
      "fillStatus": 2
    }
  ]
}
```

## 3. 顶层结果字段

顶层对象由 `processFNV3CSVData` 或 `processFNV3CSVDataEnhanced` 返回。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `method` | `string` | 是 | 处理方式。`basic` 表示基础处理，`enhanced` 表示按风暴拆分、合并后的增强处理。 |
| `stormGroups` | `number` | 仅 enhanced | 增强处理后的风暴分组数量。基础处理结果没有该字段。 |
| `originalCount` | `number` | 是 | 转换为统一格式前的记录数量。增强处理时为所有风暴分组中预报记录数量之和。 |
| `processedCount` | `number` | 是 | 成功生成的气旋对象数量，通常等于 `data.length`。 |
| `data` | `array<object>` | 是 | 气旋预报数据列表。 |

## 4. 气旋对象字段：`data[]`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `basinShort2` | `string` | 是 | 海域两字母缩写。普通 `track_id` 直接取前两位并转大写；短编号则根据经纬度推断。常见值包括 `WP`、`EP`、`CP`、`IO`、`AL`、`SH`、`SL`。 |
| `cycloneName` | `string` | 是 | 项目生成的名称，格式为 `cycloneNumber + basinShort2`。 |
| `cycloneNumber` | `string` | 是 | 气旋编号。对于普通 `track_id`，取第 3–4 个字符；短编号会生成类似 `I-01` 的编号。 |
| `ins` | `string` | 是 | 数据源标识。CSV 解析默认值为 `fnv3-gen`。 |
| `initTime` | `string` | 是 | 起报时间，ISO 8601 UTC 格式。来源为 CSV 的 `init_time`。 |
| `tcID` | `string` | 是 | 气旋唯一标识，格式为 `YYYYMMDDHH_cycloneName_cycloneNumber_ins`。 |
| `tracks` | `array<object>` | 是 | 集合预报轨迹列表。 |
| `controlIndex` | `number` | 是 | 控制成员在 `tracks` 数组中的索引；没有 `ensembleNumber = 0` 时为 `-1`。 |
| `fillStatus` | `number` | 是 | 轨迹组成状态：`1` 只有确定性预报，`2` 只有集合预报，`3` 同时包含两者。 |
| `detTrack` | `object` | 否 | 确定性预报轨迹。当前 CSV 解析主要生成集合成员；只有识别到确定性预报时才会出现。结构与 `tracks[]` 相同。 |

### `fillStatus` 枚举

| 值 | 含义 |
|---:|---|
| `1` | 只有确定性预报 |
| `2` | 只有集合预报 |
| `3` | 同时包含确定性预报和集合预报 |

## 5. 预报轨迹字段：`data[].tracks[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `fcType` | `string` | 预报类型。CSV 集合成员通常为 `ensembleForecast`。 |
| `ensembleNumber` | `number` | 集合成员编号，来源为 CSV 的 `sample` 字段并四舍五入。控制成员通常为 `0`。 |
| `track` | `array<array>` | 按预报时效升序排列的轨迹点列表。 |

### `fcType` 常见值

| 值 | 含义 |
|---|---|
| `ensembleForecast` | 集合成员预报 |
| `determineForecast` | 确定性预报 |
| `ensembleMean` | 集合平均预报 |

## 6. 轨迹点字段：`track[]`

CSV FNV3 的每个轨迹点是一个长度为 6 的数组：

```text
[step, [longitude, latitude], pressure, wind, rmw, windRadiusInfo]
```

| 索引 | 字段 | 类型 | 单位 | 说明 |
|---:|---|---|---|---|
| `0` | `step` | `number` | 小时 | 相对于 `initTime` 的预报时效，由 `valid_time - init_time` 计算。 |
| `1` | `position` | `array<number>` | 度 | 气旋中心位置，格式为 `[经度, 纬度]`。 |
| `2` | `pressure` | `number` | hPa | 最低海平面气压，对应内部字段 `pres`。 |
| `3` | `wind` | `number` | m/s | 最大持续风速。CSV 中的节数乘以 `0.5144` 转换为 m/s。 |
| `4` | `rmw` | `number` | m | 最大风速半径。CSV 中的 `radius_of_maximum_winds_km` 乘以 `1000` 转换为米。 |
| `5` | `windRadiusInfo` | `array<array>` | m | 不同风速等级的风圈半径信息，详见下一节。 |

经纬度数组说明：

```json
[longitude, latitude]
```

- `longitude`：经度，东经为正，西经为负。
- `latitude`：纬度，北纬为正，南纬为负。

## 7. 风圈字段：`windRadiusInfo`

`windRadiusInfo` 是一个数组，每个元素代表一个风速等级的风圈：

```text
[
  [windLevel, radiusNE, radiusSE, radiusSW, radiusNW],
  ...
]
```

| 索引 | 字段 | 说明 |
|---:|---|---|
| `0` | `windLevel` | 风速等级，项目内部使用 m/s 表示：`18`、`26`、`33`。 |
| `1` | `radiusNE` | 东北象限半径，单位 m。 |
| `2` | `radiusSE` | 东南象限半径，单位 m。 |
| `3` | `radiusSW` | 西南象限半径，单位 m。 |
| `4` | `radiusNW` | 西北象限半径，单位 m。 |

### 风圈等级对应关系

| `windLevel` | 原始风速等级 | 原始 CSV 字段 | 项目 JSON 中的值 |
|---:|---:|---|---|
| `18` | 34 kt | `radius_34_knot_winds_*_km` | 半径由 km 转为 m |
| `26` | 50 kt | `radius_50_knot_winds_*_km` | 半径由 km 转为 m |
| `33` | 64 kt | `radius_64_knot_winds_*_km` | 半径由 km 转为 m |

四个象限的顺序固定为：

```text
[NE, SE, SW, NW]
```

例如：

```json
"windRadiusInfo": [
  [18, 120000, 100000, 80000, 110000],
  [26, 60000, 45000, 30000, 50000],
  [33, 25000, 20000, 12000, 22000]
]
```

表示：

- 34 kt 风圈：东北 120 km、东南 100 km、西南 80 km、西北 110 km。
- 50 kt 风圈：东北 60 km、东南 45 km、西南 30 km、西北 50 km。
- 64 kt 风圈：东北 25 km、东南 20 km、西南 12 km、西北 22 km。

解析规则：

1. 每个风圈等级只有至少一个象限半径大于 0 时，才会加入 `windRadiusInfo`。
2. 缺失或无效的象限半径按 `0` 处理。
3. CSV 原始单位为 km，输出统一转换为 m。
4. 如果所有风圈数据都为空或为 0，则输出空数组 `[]`。

## 8. CSV 输入字段与 JSON 字段映射

| CSV 字段 | JSON 字段 | 转换规则 |
|---|---|---|
| `track_id` | `basinShort2`、`cycloneNumber` | 长编号取前两位和第 3–4 位；短编号根据经纬度推断海域，并生成 `I-xx` 编号。 |
| `sample` | `ensembleNumber` | 转为数字并四舍五入。 |
| `init_time` | `initTime` | 解析为 UTC 时间。 |
| `valid_time` | `step` | 计算 `valid_time - init_time`，单位为小时。 |
| `lat` | `track[][1][1]` | 转为数字，单位为度。 |
| `lon` | `track[][1][0]` | 转为数字，单位为度。 |
| `minimum_sea_level_pressure_hpa` | `track[][2]` | 转为数字，单位 hPa。 |
| `maximum_sustained_wind_speed_knots` | `track[][3]` | `knots × 0.5144`，输出单位 m/s。 |
| `radius_of_maximum_winds_km` | `track[][4]` | `km × 1000`，输出单位 m。 |
| `radius_34_knot_winds_ne_km` 等 | `track[][5]` 中的 34 kt 项 | 四个象限分别转换为米。 |
| `radius_50_knot_winds_ne_km` 等 | `track[][5]` 中的 50 kt 项 | 四个象限分别转换为米。 |
| `radius_64_knot_winds_ne_km` 等 | `track[][5]` 中的 64 kt 项 | 四个象限分别转换为米。 |

CSV 中的 `lead_time` 和 `lead_time_hours` 会被读取，但当前 `buildRecordFromCSV` 不使用，`step` 以 `valid_time` 和 `init_time` 的差值为准。

## 9. 空值和兼容性说明

- `windRadiusInfo` 没有有效风圈数据时为 `[]`，不是 `null`。
- `rmw` 或其他数值字段缺失时，JavaScript 内部可能为 `NaN`；使用 `JSON.stringify` 序列化后会显示为 `null`。
- `detTrack` 是可选字段，不保证每条气旋数据都有。
- `controlIndex = -1` 表示没有找到 `ensembleNumber = 0` 的控制成员。
- `src/fnv3download.js` 的 ATCF 输出轨迹目前是 4 元素格式，不包含本文档第 4、5 项的 `rmw` 和 `windRadiusInfo`；如需风圈，应使用 CSV 解析链路或扩展 ATCF 解析器。
