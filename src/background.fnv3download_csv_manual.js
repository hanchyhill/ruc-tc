const rp = require('request-promise-native');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const toArray = require('dayjs/plugin/toArray');
dayjs.extend(toArray);
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);
const fs = require('fs');
const path = require('path');
const process = require('process');


// 设置代理环境变量
process.env.HTTP_PROXY = 'http://127.0.0.1:10809';
process.env.HTTPS_PROXY = 'http://127.0.0.1:10809';
process.env.http_proxy = process.env.HTTP_PROXY;
process.env.https_proxy = process.env.HTTPS_PROXY;

let save2DB;
// 判断当前环境是 Windows 还是 Linux
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
if(isWindows){
    var BASE_DIR = "\\\\10.148.44.81\\data_hpc\\typhoon\\fnv3";
}else{
    var BASE_DIR = "/var/www/html/data/cyclone/fnv3"; // atcf_ensemble
}

var BASE_URL_MIRROR = "http://deepmind.gdmo.gq"
var BASE_URL_ORIGINAL = "https://deepmind.google.com"
var BASE_URL = BASE_URL_ORIGINAL

function saveDataToFile(data, filename, timeStr, type="atcf_ensemble") {
    const base_path = BASE_DIR;
    // 从timeStr中提取年份和月份 (格式: YYYY_MM_DDTHH_00)
    const yearMonth = timeStr.substring(0, 7); // 提取 YYYY_MM
    const fileName = filename;
    const filePath = path.join(base_path, type, yearMonth, fileName);


    // 确保目录存在
    fs.mkdirSync(path.join(base_path, type, yearMonth), { recursive: true });

    // 写入文件
    fs.writeFileSync(filePath, data);
    console.log(`Data saved to: ${filePath}`);

    return filePath;
}

function checkFileExists(filename, timeStr, type="atcf_ensemble") {
    const base_path = BASE_DIR;
    // 从timeStr中提取年份和月份 (格式: YYYY_MM_DDTHH_00)
    const yearMonth = timeStr.substring(0, 7); // 提取 YYYY_MM
    const filePath = path.join(base_path, type, yearMonth, filename);

    return fs.existsSync(filePath);
}

async function downloadOtherData(date){
    const timeStr = date.format('YYYY_MM_DDTHH_00');
    let tcfa_file_name = `FNV3_${timeStr}_atcf_a_deck.txt`;
    let csv_pair_file_name = `FNV3_${timeStr}_paired.csv`;
    let csv_cyclogenesis_file_name = `FNV3_${timeStr}_cyclogenesis.csv`;
    // 检查文件是否已存在
    

    // demo url            http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble/paired/atcf/FNV3_2025_09_28T00_00_atcf_a_deck.txt
    let url_tcfa_ensemble_mirror = `${BASE_URL}/science/weatherlab/download/cyclones/FNV3/ensemble/paired/atcf/${tcfa_file_name}`;
    let url_tcfa_ensemble_mean_mirror = `${BASE_URL}/science/weatherlab/download/cyclones/FNV3/ensemble_mean/paired/atcf/${tcfa_file_name}`
    let url_csv_pair_ensemble_mirror = `${BASE_URL}/science/weatherlab/download/cyclones/FNV3/ensemble/paired/csv/${csv_pair_file_name}`;
    let url_csv_pair_mean_mirror = `${BASE_URL}/science/weatherlab/download/cyclones/FNV3/ensemble_mean/paired/csv/${csv_pair_file_name}`;
    let url_csv_cyclogenesis_mirror = `${BASE_URL}/science/weatherlab/download/cyclones/FNV3/ensemble/cyclogenesis/csv/${csv_cyclogenesis_file_name}`;
    try {
        if (checkFileExists(tcfa_file_name, timeStr, "atcf_ensemble")) {
            console.log(`File ${tcfa_file_name} already exists for ${timeStr}, skipping download`);
        }else{
            console.log('准备下载 TCFA Ensemble:' + tcfa_file_name)
            let tcfa_raw = await rp(url_tcfa_ensemble_mirror);
            const filePath = saveDataToFile(tcfa_raw, tcfa_file_name, timeStr, "atcf_ensemble");
        }
        
    } catch (error) {
        console.error(`Failed to download data for ${date.format('YYYY-MM-DD HH:mm:ss')}:`, error.message);
        return null;
    }
    try {
        if (checkFileExists(tcfa_file_name, timeStr, "atcf_ensemble_mean")) {
            console.log(`File ${tcfa_file_name} already exists for ${timeStr}, skipping download`);
        }else{
            console.log('准备下载 TCFA Ensemble Mean:' + tcfa_file_name)
            let tcfa_raw = await rp(url_tcfa_ensemble_mean_mirror);
            const filePath = saveDataToFile(tcfa_raw, tcfa_file_name, timeStr, "atcf_ensemble_mean");
        }
    } catch (error) {
        console.error(`Failed to download data for ${date.format('YYYY-MM-DD HH:mm:ss')}:`, error.message);
        return null;
    }
    try {
        if (checkFileExists(csv_pair_file_name, timeStr, "csv_pair_ensemble")) {
            console.log(`File ${csv_pair_file_name} already exists for ${timeStr}, skipping download`);
        }else{
            console.log('准备下载 CSV Pair Ensemble:' + csv_pair_file_name)
            let csv_pair_raw = await rp(url_csv_pair_ensemble_mirror);
            const filePath = saveDataToFile(csv_pair_raw, csv_pair_file_name, timeStr, "csv_pair_ensemble");
        }
    } catch (error) {
        console.error(`Failed to download data for ${date.format('YYYY-MM-DD HH:mm:ss')}:`, error.message);
        return null;
    }
    try {
        if (checkFileExists(csv_pair_file_name, timeStr, "csv_pair_ensemble_mean")) {
            console.log(`File ${csv_pair_file_name} already exists for ${timeStr}, skipping download`);
        }else{
            console.log('准备下载 CSV Pair Mean:' + csv_pair_file_name)
            let csv_pair_raw = await rp(url_csv_pair_mean_mirror);
            const filePath = saveDataToFile(csv_pair_raw, csv_pair_file_name, timeStr, "csv_pair_ensemble_mean");
        }
    } catch (error) {
        console.error(`Failed to download data for ${date.format('YYYY-MM-DD HH:mm:ss')}:`, error.message);
        return null;
    }
    try {
        if (checkFileExists(csv_cyclogenesis_file_name, timeStr, "csv_cyclogenesis")) {
            console.log(`File ${csv_cyclogenesis_file_name} already exists for ${timeStr}, skipping download`);
        }else{  
        console.log('准备下载 CSV Cyclogenesis:' + csv_cyclogenesis_file_name)
        let csv_cyclogenesis_raw = await rp(url_csv_cyclogenesis_mirror);
            const filePath = saveDataToFile(csv_cyclogenesis_raw, csv_cyclogenesis_file_name, timeStr, "ensemble");
        }
    } catch (error) {
        console.error(`Failed to download data for ${date.format('YYYY-MM-DD HH:mm:ss')}:`, error.message);
        return null;
    }

}


function getLatestModelTime(){
    const now = dayjs.utc();
    const hour = now.hour();

    if (hour >= 11 && hour < 18) {
        // 06UTC
        return now.hour(6).minute(0).second(0).millisecond(0);
    } else if (hour >= 18 && hour < 23) {
        // 12UTC
        return now.hour(12).minute(0).second(0).millisecond(0);
    } else if (hour >= 23 || hour < 6) {
        // 18UTC，需要判断是当天还是前一天
        if (hour >= 23) {
            return now.hour(18).minute(0).second(0).millisecond(0);
        } else {
            return now.subtract(1, 'day').hour(18).minute(0).second(0).millisecond(0);
        }
    } else if (hour >= 6 && hour < 11) {
        // 00UTC
        return now.hour(0).minute(0).second(0).millisecond(0);
    }
}

function getLatestModelTimeList(list_count = 4){
    let latestModelTime = getLatestModelTime();
    let timeList = [];

    for (let i = 0; i < list_count; i++) {
        timeList.push(latestModelTime.subtract(i * 6, 'hour'));
    }

    return timeList;
}

async function main() {
    const start_time = dayjs.utc('2022-01-01 00:00:00');
    const end_time = dayjs.utc();
    const day_count = end_time.diff(start_time, 'day');
    time_cout = day_count * 4;
    const timeList = getLatestModelTimeList(time_cout);
    for(let time of timeList){
        if(time.isAfter(start_time) && time.isBefore(end_time)){
            try {
                console.log(time.format('YYYYMMDD HH:mm:ss'));
                // await downloadData(time);
                await downloadOtherData(time);
            } catch (error) {
                console.error(`Error processing time ${time.format('YYYYMMDD HH:mm:ss')}:`, error.message);
                continue;
            }
        }
    }

}

main().catch(err=>{
    console.trace(err);
})
