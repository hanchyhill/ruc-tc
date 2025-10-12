const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const rp = require('request-promise-native');
dayjs.extend(utc);


/**
 * 获取 AIFS 集合预报数据。
 * @async
 * @function
 * @param {string} [date="2025101200"] - 预报起报时间（格式：YYYYMMDDHH），默认为"2025101200"。
 * @param {string} [area="WesternPacific"] - 区域，如"WesternPacific"。
 * @returns {Promise<Object>} 返回解析后的 AIFS 集合预报数据对象。
 */
async function get_aifs(date = "2025101200", area = "WesternPacific") {
    const url = `https://www.smca.fun/api/tc_gis_tracks_cluster/?forecastType=cluster&model=aifs&date=${date}&area=${area}`;
    const response = await rp(url);
    const data = JSON.parse(response);
    return data;
}

/**
 * 用 :contentReference[oaicite:6]{index=6} & :contentReference[oaicite:7]{index=7} (1977) 经验公式估算西北太平洋台风最大持续风速。
 * @param {number} p_c – 中心气压 (hPa)
 * @param {number} p_env – 环境气压 (hPa)，默认 1010 hPa
 * @returns {number} – 估算最大持续风速 (m/s)
 */
function estimateMaxWind_WNP(p_c, p_env = 1010) {
    if (p_c >= p_env) {
      console.warn("中心气压大于或等于环境气压，模型可能失效");
      return 5;
    }
    // Atkinson & Holliday 1977: V (knots) = 3.4 * (p_env - p_c)^0.644
    const deltaP = p_env - p_c;
    const V_knots = 3.4 * Math.pow(deltaP, 0.644);
    const V_ms = V_knots * 0.51444;  // 转换为 m/s
    return V_ms;
}

function trans_aifs_to_mongo_format(data){
    const ins = data[0]["model"]+'-cai';
    const basinShort2 = 'WP';
    const init_time_str = data[0]["init_time"];
    const initTime = dayjs.utc(init_time_str).toDate();
    const fillStatus = 2; // 只有集合预报
    const tracks = data[1]["cluster_track"].map(item => {
        let track = item["track"].map(loc_info => {
            let step = loc_info["step"];
            let lon = loc_info["longitude"];
            let lat = loc_info["latitude"];
            let pres = loc_info["pressure"];
            let wind = loc_info["wind"] == 0 ? estimateMaxWind_WNP(pres) : loc_info["wind"];
            let info_format = [
                step,
                [lon,lat],
                pres,
                wind,
            ];
            return info_format
        })
        return {
            fcType: "ensembleForecast",
            "ensembleNumber": 999,
            track,
            loc: track[0][1],
            "cluster_id":item["cluster_id"]
        }
    });

    // 根据 cluster_id 分组
    // 把 split_tracks_list 改为 lArray 格式（即二维数组，每个子数组为同一 cluster_id 的轨迹组）
    const clusterMap = tracks.reduce((acc, track) => {
        const clusterId = track.cluster_id;
        if (!acc[clusterId]) {
            acc[clusterId] = [];
        }
        acc[clusterId].push(track);
        return acc;
    }, {});
    const split_tracks_list = Object.values(clusterMap);

    const mongo_format_list = split_tracks_list.map(tracks_list => {
        let cycloneNumber = 'I'+tracks_list[0].cluster_id;
        let cycloneName = 'I'+tracks_list[0].cluster_id+basinShort2;
        tracks_list = tracks_list.map((track_info,index) => {
            track_info["ensembleNumber"] = index;
            return track_info;
        })
        return {
            ins,
            basinShort2,
            cycloneNumber,
            cycloneName,
            initTime,
            fillStatus,
            tracks: tracks_list,
        }
    })
    return mongo_format_list;

}

if (require.main === module) {
    get_aifs().then(data => {
        console.log(data);
        const mongo_format_list = trans_aifs_to_mongo_format(data);
        console.log(mongo_format_list);
    });
}
  
module.exports = {
  get_aifs,
  trans_aifs_to_mongo_format,
};

