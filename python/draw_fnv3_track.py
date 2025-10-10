#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FNV3台风集合预报路径绘制脚本
使用cartopy和matplotlib绘制台风路径图
"""

import json
import numpy as np
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from cartopy.mpl.gridliner import LONGITUDE_FORMATTER, LATITUDE_FORMATTER
import matplotlib.patches as mpatches
from datetime import datetime, timedelta
import os

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

def load_fnv3_data(json_file_path):
    """
    加载FNV3 JSON数据文件
    
    Args:
        json_file_path (str): JSON文件路径
        
    Returns:
        dict: 解析后的数据
    """
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"成功加载数据文件: {json_file_path}")
        print(f"数据统计: {len(data['data'])}个风暴组, {data['processedCount']}个处理后的记录")
        return data
    except Exception as e:
        print(f"加载数据文件失败: {e}")
        return None

def parse_track_data(storm_data):
    """
    解析单个风暴的轨迹数据
    
    Args:
        storm_data (dict): 单个风暴数据
        
    Returns:
        dict: 解析后的轨迹信息
    """
    tracks = []
    
    for track_info in storm_data.get('tracks', []):
        track_points = track_info.get('track', [])
        if not track_points:
            continue
            
        # 解析轨迹点: [时间步长, [经度, 纬度], 气压, 风速]
        times = []
        lons = []
        lats = []
        pressures = []
        winds = []
        
        for point in track_points:
            if len(point) >= 4:
                time_step = point[0]  # 小时
                lon, lat = point[1]   # 经纬度
                pressure = point[2]   # 气压 (hPa)
                wind = point[3]       # 风速 (m/s)
                
                times.append(time_step)
                lons.append(lon)
                lats.append(lat)
                pressures.append(pressure)
                winds.append(wind)
        
        if lons and lats:
            tracks.append({
                'ensemble_number': track_info.get('ensembleNumber', 0),
                'fc_type': track_info.get('fcType', 'unknown'),
                'times': times,
                'lons': lons,
                'lats': lats,
                'pressures': pressures,
                'winds': winds
            })
    
    return {
        'storm_id': storm_data.get('tcID', 'unknown'),
        'cyclone_name': storm_data.get('cycloneName', 'unknown'),
        'basin': storm_data.get('basinShort2', 'unknown'),
        'init_time': storm_data.get('initTime', 'unknown'),
        'tracks': tracks
    }

def fix_dateline_crossing(lons, lats):
    """
    修复跨越180°经线的轨迹数据，避免错误的连线
    
    Args:
        lons (list): 经度列表
        lats (list): 纬度列表
        
    Returns:
        tuple: (修正后的经度列表, 修正后的纬度列表, 分段索引列表)
    """
    if len(lons) < 2:
        return lons, lats, [list(range(len(lons)))]
    
    fixed_lons = []
    fixed_lats = []
    segments = []
    current_segment = []
    
    # 第一个点
    fixed_lons.append(lons[0])
    fixed_lats.append(lats[0])
    current_segment.append(0)
    
    for i in range(1, len(lons)):
        lon_diff = lons[i] - lons[i-1]
        
        # 检测是否跨越日期变更线 (经度差值大于180度)
        if abs(lon_diff) > 180:
            # 结束当前段
            if len(current_segment) > 1:
                segments.append(current_segment.copy())
            
            # 开始新段
            current_segment = [len(fixed_lons)]
            
            # 调整经度以保持连续性
            if lon_diff > 180:
                # 从东向西跨越日期变更线
                adjusted_lon = lons[i] - 360
            else:
                # 从西向东跨越日期变更线
                adjusted_lon = lons[i] + 360
            
            fixed_lons.append(adjusted_lon)
        else:
            fixed_lons.append(lons[i])
        
        fixed_lats.append(lats[i])
        current_segment.append(len(fixed_lons) - 1)
    
    # 添加最后一段
    if len(current_segment) > 1:
        segments.append(current_segment)
    
    return fixed_lons, fixed_lats, segments

def get_wind_color(wind_speed):
    """
    根据风速获取颜色
    
    Args:
        wind_speed (float): 风速 (m/s)
        
    Returns:
        str: 颜色代码
    """
    # 转换为节 (knots): 1 m/s ≈ 1.944 knots
    wind_knots = wind_speed * 1.944
    
    if wind_knots < 34:
        return '#74add1'  # 热带低压 - 浅蓝
    elif wind_knots < 64:
        return '#4575b4'  # 热带风暴 - 蓝色
    elif wind_knots < 83:
        return '#fee090'  # 一级飓风 - 黄色
    elif wind_knots < 96:
        return '#fdae61'  # 二级飓风 - 橙色
    elif wind_knots < 113:
        return '#f46d43'  # 三级飓风 - 红橙色
    elif wind_knots < 137:
        return '#d73027'  # 四级飓风 - 红色
    else:
        return '#a50026'  # 五级飓风 - 深红色

def create_storm_map(storm_data, save_path=None):
    """
    为单个风暴创建地图
    
    Args:
        storm_data (dict): 风暴数据
        save_path (str): 保存路径
    """
    if not storm_data['tracks']:
        print(f"风暴 {storm_data['cyclone_name']} 没有轨迹数据")
        return
    
    # 计算地图范围
    all_lons = []
    all_lats = []
    for track in storm_data['tracks']:
        all_lons.extend(track['lons'])
        all_lats.extend(track['lats'])
    
    if not all_lons or not all_lats:
        print(f"风暴 {storm_data['cyclone_name']} 没有有效的经纬度数据")
        return
    
    lon_min, lon_max = min(all_lons), max(all_lons)
    lat_min, lat_max = min(all_lats), max(all_lats)
    
    # 扩展边界
    lon_margin = (lon_max - lon_min) * 0.2
    lat_margin = (lat_max - lat_min) * 0.2
    
    lon_min -= lon_margin
    lon_max += lon_margin
    lat_min -= lat_margin
    lat_max += lat_margin
    
    # 创建图形
    fig = plt.figure(figsize=(12, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())
    
    # 设置地图范围
    ax.set_extent([lon_min, lon_max, lat_min, lat_max], crs=ccrs.PlateCarree())
    
    # 添加地图特征
    ax.add_feature(cfeature.COASTLINE, linewidth=0.8)
    ax.add_feature(cfeature.BORDERS, linewidth=0.5)
    ax.add_feature(cfeature.OCEAN, color='lightblue', alpha=0.5)
    ax.add_feature(cfeature.LAND, color='lightgray', alpha=0.5)
    
    # 添加网格线
    gl = ax.gridlines(crs=ccrs.PlateCarree(), draw_labels=True,
                      linewidth=0.5, color='gray', alpha=0.7, linestyle='--')
    gl.top_labels = False
    gl.right_labels = False
    gl.xformatter = LONGITUDE_FORMATTER
    gl.yformatter = LATITUDE_FORMATTER
    
    # 绘制集合预报轨迹
    ensemble_colors = plt.cm.Set3(np.linspace(0, 1, len(storm_data['tracks'])))
    
    for i, track in enumerate(storm_data['tracks']):
        if len(track['lons']) < 2:
            continue
            
        # 修复跨越日期变更线的轨迹
        fixed_lons, fixed_lats, segments = fix_dateline_crossing(track['lons'], track['lats'])
        
        # 绘制轨迹线 - 每个集合成员独立绘制
        color = ensemble_colors[i] if len(storm_data['tracks']) > 1 else 'red'
        alpha = 0.6 if len(storm_data['tracks']) > 1 else 0.8
        
        # 分段绘制轨迹以避免跨越日期变更线的错误连线
        for segment in segments:
            if len(segment) < 2:
                continue
            segment_lons = [fixed_lons[idx] for idx in segment]
            segment_lats = [fixed_lats[idx] for idx in segment]
            
            ax.plot(segment_lons, segment_lats, 
                    color=color, alpha=alpha, linewidth=1.5,
                    transform=ccrs.PlateCarree(),
                    label=f"集合成员 {track['ensemble_number']}" if segment == segments[0] else "")
        
        # 绘制起始点 - 使用原始坐标
        ax.plot(track['lons'][0], track['lats'][0], 
                'go', markersize=8, transform=ccrs.PlateCarree())
        
        # 绘制结束点 - 使用原始坐标
        ax.plot(track['lons'][-1], track['lats'][-1], 
                'ro', markersize=8, transform=ccrs.PlateCarree())
        
        # 根据风速绘制强度点 - 使用原始坐标
        for j, (lon, lat, wind) in enumerate(zip(track['lons'], track['lats'], track['winds'])):
            if j % 4 == 0:  # 每4个点绘制一个强度标记
                wind_color = get_wind_color(wind)
                ax.plot(lon, lat, 'o', color=wind_color, markersize=4, 
                       transform=ccrs.PlateCarree(), alpha=0.8)
    
    # 添加标题和图例
    title = f"FNV3 台风集合预报 - {storm_data['cyclone_name']} ({storm_data['basin']})"
    if storm_data['init_time'] != 'unknown':
        try:
            init_time = datetime.fromisoformat(storm_data['init_time'].replace('Z', '+00:00'))
            title += f"\n初始时间: {init_time.strftime('%Y-%m-%d %H:%M UTC')}"
        except:
            title += f"\n初始时间: {storm_data['init_time']}"
    
    plt.title(title, fontsize=14, pad=20)
    
    # 添加图例
    legend_elements = [
        mpatches.Patch(color='green', label='起始点'),
        mpatches.Patch(color='red', label='结束点'),
        mpatches.Patch(color='#74add1', label='热带低压 (<34 kt)'),
        mpatches.Patch(color='#4575b4', label='热带风暴 (34-63 kt)'),
        mpatches.Patch(color='#fee090', label='一级飓风 (64-82 kt)'),
        mpatches.Patch(color='#fdae61', label='二级飓风 (83-95 kt)'),
        mpatches.Patch(color='#f46d43', label='三级飓风 (96-112 kt)'),
        mpatches.Patch(color='#d73027', label='四级飓风 (113-136 kt)'),
        mpatches.Patch(color='#a50026', label='五级飓风 (>136 kt)')
    ]
    
    ax.legend(handles=legend_elements, loc='upper right', bbox_to_anchor=(1.15, 1))
    
    plt.tight_layout()
    
    # 保存图片
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"图片已保存到: {save_path}")
    
    plt.show()

def create_overview_map(data, save_path=None):
    """
    创建所有风暴的概览地图
    
    Args:
        data (dict): 完整的FNV3数据
        save_path (str): 保存路径
    """
    fig = plt.figure(figsize=(15, 10))
    ax = plt.axes(projection=ccrs.PlateCarree())
    
    # 设置全球视图
    ax.set_global()
    
    # 添加地图特征
    ax.add_feature(cfeature.COASTLINE, linewidth=0.8)
    ax.add_feature(cfeature.BORDERS, linewidth=0.5)
    ax.add_feature(cfeature.OCEAN, color='lightblue', alpha=0.3)
    ax.add_feature(cfeature.LAND, color='lightgray', alpha=0.5)
    
    # 添加网格线
    gl = ax.gridlines(crs=ccrs.PlateCarree(), draw_labels=True,
                      linewidth=0.5, color='gray', alpha=0.7, linestyle='--')
    gl.top_labels = False
    gl.right_labels = False
    
    # 为每个风暴分配颜色
    storm_colors = plt.cm.tab20(np.linspace(0, 1, len(data['data'])))
    
    # 绘制所有风暴轨迹
    for i, storm_info in enumerate(data['data']):
        storm_data = parse_track_data(storm_info)
        
        if not storm_data['tracks']:
            continue
            
        base_color = storm_colors[i]
        
        # 为同一风暴的不同集合成员创建颜色变化
        num_tracks = len(storm_data['tracks'])
        if num_tracks > 1:
            # 如果有多个集合成员，使用不同的透明度和线型
            alphas = np.linspace(0.3, 0.8, num_tracks)
            linestyles = ['-', '--', '-.', ':'] * (num_tracks // 4 + 1)
        else:
            alphas = [0.7]
            linestyles = ['-']
        
        for j, track in enumerate(storm_data['tracks']):
            if len(track['lons']) < 2:
                continue
                
            # 修复跨越日期变更线的轨迹
            fixed_lons, fixed_lats, segments = fix_dateline_crossing(track['lons'], track['lats'])
            
            # 绘制轨迹线 - 每个track独立绘制，使用不同样式
            alpha = alphas[j] if j < len(alphas) else 0.5
            linestyle = linestyles[j] if j < len(linestyles) else '-'
            
            # 分段绘制轨迹以避免跨越日期变更线的错误连线
            for segment in segments:
                if len(segment) < 2:
                    continue
                segment_lons = [fixed_lons[idx] for idx in segment]
                segment_lats = [fixed_lats[idx] for idx in segment]
                
                ax.plot(segment_lons, segment_lats, 
                        color=base_color, alpha=alpha, linewidth=1,
                        linestyle=linestyle,
                        transform=ccrs.PlateCarree())
            
            # 绘制起始点 - 使用原始坐标
            ax.plot(track['lons'][0], track['lats'][0], 
                    'o', color=base_color, markersize=4, alpha=alpha,
                    transform=ccrs.PlateCarree())
        
        # 添加风暴名称标注 - 只在第一个track的起始点标注
        if storm_data['tracks']:
            first_track = storm_data['tracks'][0]
            if first_track['lons']:
                ax.text(first_track['lons'][0], first_track['lats'][0], 
                       storm_data['cyclone_name'], 
                       transform=ccrs.PlateCarree(),
                       fontsize=8, ha='center', va='bottom',
                       bbox=dict(boxstyle='round,pad=0.2', facecolor='white', alpha=0.7))
    
    # 添加标题
    title = f"FNV3 台风集合预报概览\n共 {len(data['data'])} 个风暴组"
    if data['data'] and 'initTime' in data['data'][0]:
        try:
            init_time = datetime.fromisoformat(data['data'][0]['initTime'].replace('Z', '+00:00'))
            title += f" - 初始时间: {init_time.strftime('%Y-%m-%d %H:%M UTC')}"
        except:
            pass
    
    plt.title(title, fontsize=16, pad=20)
    
    plt.tight_layout()
    
    # 保存图片
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"概览图已保存到: {save_path}")
    
    plt.show()

def main():
    """
    主函数
    """
    # 数据文件路径
    # fnv3_basic_result
    json_file = os.path.join(os.path.dirname(__file__), '..', 'demo', 'fnv3_enhanced_result.json')
    # json_file = os.path.join(os.path.dirname(__file__), '..', 'demo', 'fnv3_basic_result.json')
    # 加载数据
    data = load_fnv3_data(json_file)
    if not data:
        return
    
    # 创建输出目录
    output_dir = os.path.join(os.path.dirname(__file__), 'output')
    os.makedirs(output_dir, exist_ok=True)
    
    # 创建概览图
    print("正在创建概览图...")
    overview_path = os.path.join(output_dir, 'fnv3_overview.png')
    create_overview_map(data, overview_path)
    
    # 为每个风暴创建详细图
    print(f"正在为 {len(data['data'])} 个风暴创建详细图...")
    
    for i, storm_info in enumerate(data['data'][:5]):  # 限制前5个风暴以避免生成太多图片
        storm_data = parse_track_data(storm_info)
        
        if storm_data['tracks']:
            print(f"正在绘制风暴: {storm_data['cyclone_name']}")
            storm_path = os.path.join(output_dir, f"storm_{storm_data['cyclone_name']}.png")
            create_storm_map(storm_data, storm_path)
    
    print("绘图完成！")

if __name__ == "__main__":
    main()
