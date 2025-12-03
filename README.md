# ruc-tc

从RUC网站获取数值模式预报报文


# 台风集合预报持续偏转台风的统计特征分析

## 1. 数据准备

数据文件为json格式
H:\github\data\cyclone\json_format\ecmwf

## JSON格式字段说明

```
字段说明:
tracks  集合预报路径数组
basin	海域
cycloneNumber	气旋编号(由预报机构给出，与气旋的国际编号不同)
cycloneName	命名，没有命名的台风会是阿拉伯数字，数字加海区缩写，Invest,数字英文表示等等形式出现，具体看是哪家机构的
innerID	内部编号
basinShort	海域简称
ins	机构
model	模式
initTime	起报时间(世界时标准时间戳)
maxWind	集合预报中的最大风速(如果有的话)
loc	气旋的经纬度数组
tcID	唯一编号(文件名)
detTrack	确定性预报，确定性预报路径不一定有
controlIndex	集合预报中的控制预报对应tracks字段所在的数组索引
fillStatus	不用管，程序解码时候用于统计是否有确定性预报的标志符

【tracks】 数组和【detTrack】中的字段说明
{
      "fcType": ensembleForecast/forecast,对应的预报类型, 集合预报或者是确定性预报
      "ensembleNumber": 第几个集合预报，确定性预报此项为null
      "loc": [108.6,16.1],// 经纬度，与根节点的loc字段是一样的不用管
      "track": [],// 具体路径数组
      "maxWind": '此路径中的最大风速'
    },
    
【track】字段说明
[ 
	6,// 索引0, 第几个预报时效,小时
	[108,15.6],// 索引1, 台风中心经纬度
	987.7,// 索引2, 台风中心最低气压
	19.7,// 索引3, 台风中心附近最大风速
	[109.5,15]// 索引4, 最大风速所在经纬度，索引4及以后的数值不同模式都不一样，只有ECMWF采用最大风速经纬度这个字段
]
```

## 查找台风关联

需求：把集合预报的台风与最佳路径集中的台风进行关联，并把最佳路径的台风的"combined_ID"给到集合预报的台风。生成一个新的JSON文件。
集合预报的台风文件简写成"tc.json"，最佳路径的台风文件简写为"BST.json"。
集合预报的台风文件保存的目录在H:\github\data\cyclone\json_format\ecmwf，最佳路径的台风文件保存的目录在H:\github\python\typhoon_direction\output。

具体任务流程如下：
1. 读取指定目录下（H:\github\data\cyclone\json_format\ecmwf）的每个集合预报的json文件，记作"tc.json"，如果键basin为"Northwest Pacific"则保留继续进行步骤2，否则跳过。
2. 从"initTime"解析出年份，从指定目录(H:\github\python\typhoon_direction\output)找到对应年份的BST.json文件，对应的文件名为"CH{year}BST.json",其中{year}为四位年份，如2023。 打开BST.json文件。
3. 读取"tc.json"的cycloneName属性，如果cycloneName属性的字符串不包含数字，则执行步骤4，否则执行5
4. cycloneName中的字符串转为大写字母，并与BST.json文件中的"name"进行比对，如果相同，则匹配到了对应的台风，把BST.json文件中的"combined_ID"给到此台风，完成台风的匹配。如果遍历后无法找到相同的，则执行步骤5.如果找到了则不需要执行步骤5，完成此台风的匹配。
5. 读取"tc.json"属性"loc"，其为数组，类似如loc=[140.4, 13.4]，其中loc[0]为经度，loc[1]为纬度。把"BST.json"中的每个台风的"track"属性中的"time_utc"与"tc.json"中的"initTime"进行匹配，如果匹配成功则执行步骤6，否则把"combined_ID"记为空字符串。
6. 比较相同的时次"lat"和"lon"的值，如果"loc"中的经纬度和此经纬度的值的差值的绝对值小于1，则认为是同一个台风，把BST.json文件中的"combined_ID"给到此台风，完成台风的匹配。如果不满足条件，则回到步骤5，匹配下一个台风并继续寻找。如果到最后一个仍然未找到，则把"combined_ID"记为空字符串。

最后得到一个JSON列表，包含每个集合预报的文件名属性file_name，和对应的"combined_ID"属性。


格式参考，
```tc.json
{  
  "basin": "Northwest Pacific",
  "cycloneNumber": "2",
  "cycloneName": "Wutip",
  "innerID": "2019022500_134N_1404E",
  "basinShort": "W",
  "ins": "ecmwf",
  "model": "ECMWF",
  "initTime": "2019-02-25T00:00:00.000Z",
  "maxWind": 78.2,
  "loc": [
    140.4,
    13.4
  ],
  "tcID": "2019022508_Wutip_2Northwest-Pacific_ECMWF",
  "detTrack":[],
  "tracks":[],
}

```

## 台风聚类策略