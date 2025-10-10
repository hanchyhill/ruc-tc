# FNV3台风集合预报路径绘制工具

这个Python脚本用于绘制FNV3台风集合预报路径，使用cartopy和matplotlib库创建专业的台风路径图。

## 功能特性

- 🌀 绘制台风集合预报轨迹
- 🗺️ 使用cartopy创建专业地图投影
- 🎨 根据风速强度显示不同颜色
- 📊 支持单个风暴详细图和多风暴概览图
- 🏷️ 自动标注台风名称和强度等级

## 安装依赖

### 方法1：使用pip安装
```bash
pip install -r requirements.txt
```

### 方法2：使用conda安装（推荐）
```bash
conda install -c conda-forge cartopy matplotlib numpy
```

## 使用方法

### 基本用法
```bash
cd python
python draw_fnv3_track.py
```

### 数据文件
脚本会自动读取 `../demo/fnv3_enhanced_result.json` 文件，该文件由 `resolve.CSV_fnv3.js` 生成。

### 输出文件
- 概览图：`python/output/fnv3_overview.png`
- 单个风暴图：`python/output/storm_[风暴名称].png`

## 数据结构说明

JSON文件中的轨迹数据格式：
```json
{
  "data": [
    {
      "cycloneName": "I-01EP",
      "basinShort2": "EP", 
      "initTime": "2025-09-27T18:00:00.000Z",
      "tracks": [
        {
          "ensembleNumber": 0,
          "track": [
            [时间步长(小时), [经度, 纬度], 气压(hPa), 风速(m/s)],
            ...
          ]
        }
      ]
    }
  ]
}
```

## 风速等级颜色说明

- 🔵 热带低压 (<34 kt) - 浅蓝色
- 🔵 热带风暴 (34-63 kt) - 蓝色  
- 🟡 一级飓风 (64-82 kt) - 黄色
- 🟠 二级飓风 (83-95 kt) - 橙色
- 🔴 三级飓风 (96-112 kt) - 红橙色
- 🔴 四级飓风 (113-136 kt) - 红色
- 🔴 五级飓风 (>136 kt) - 深红色

## 自定义选项

可以修改脚本中的以下参数：
- `figsize`: 图片尺寸
- 颜色方案和透明度
- 地图投影类型
- 输出图片数量限制

## 故障排除

### cartopy安装问题
如果cartopy安装失败，请参考官方文档：
https://scitools.org.uk/cartopy/docs/latest/installing.html

### 中文字体问题
如果中文显示异常，请确保系统安装了中文字体，或修改脚本中的字体设置。

### 内存不足
如果处理大量数据时内存不足，可以减少同时处理的风暴数量。
