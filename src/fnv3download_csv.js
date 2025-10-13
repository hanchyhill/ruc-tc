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
const {processFNV3CSVDataEnhanced} = require('./resolve.CSV_fnv3.js');
const schedule = require('node-schedule');
const {connect,initSchemas} = require('./db/initDB.js');
const process = require('process');

let save2DB;
// 判断当前环境是 Windows 还是 Linux
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
if(isWindows){
    BASE_DIR = "\\\\10.148.44.81\\data_hpc\\typhoon\\fnv3";
}else{
    BASE_DIR = "/var/www/html/data/cyclone/fnv3"; // atcf_ensemble
}

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
    let url_tcfa_ensemble_mirror = `http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble/paired/atcf/${tcfa_file_name}`;
    let url_tcfa_ensemble_mean_mirror = `http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble_mean/paired/atcf/${tcfa_file_name}`
    let url_csv_pair_ensemble_mirror = `http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble/paired/csv/${csv_pair_file_name}`;
    let url_csv_pair_mean_mirror = `http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble_mean/paired/csv/${csv_pair_file_name}`;
    // let url_csv_cyclogenesis_mirror = `http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble/cyclogenesis/csv/${csv_cyclogenesis_file_name}`;
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
    // try {
    //     console.log('CSV Cyclogenesis:' + csv_cyclogenesis_file_name)
    //     let csv_cyclogenesis_raw = await rp(url_csv_cyclogenesis_mirror);
    //     const filePath = saveDataToFile(csv_cyclogenesis_raw, csv_cyclogenesis_file_name, timeStr, "ensemble");
    // } catch (error) {
    //     console.error(`Failed to download data for ${date.format('YYYY-MM-DD HH:mm:ss')}:`, error.message);
    //     return null;
    // }

}

async function downloadData(date){
    try {

        const timeStr = date.format('YYYY_MM_DDTHH_00');
        let csv_cyclogenesis_file_name = `FNV3_${timeStr}_cyclogenesis.csv`;
        // 检查文件是否已存在
        if (checkFileExists(csv_cyclogenesis_file_name, timeStr, "csv_cyclogenesis")) {
            console.log(`File ${csv_cyclogenesis_file_name} already exists for ${timeStr}, skipping download`);
            return null;
        }
       
        // demo url            http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble/paired/atcf/FNV3_2025_09_28T00_00_atcf_a_deck.txt
        // let url_tcfa_mirror = `http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble/paired/atcf/FNV3_${timeStr}_atcf_a_deck.txt`
        let url_csv_cyclogenesis_mirror = `http://deepmind.gdmo.gq/science/weatherlab/download/cyclones/FNV3/ensemble/cyclogenesis/csv/${csv_cyclogenesis_file_name}`;
        console.log('准备下载 CSV Cyclogenesis:' + url_csv_cyclogenesis_mirror)
        let tcfa_raw = await rp(url_csv_cyclogenesis_mirror)
        // console.log(tcfa_raw)

        // 保存数据
        const filePath = saveDataToFile(tcfa_raw, csv_cyclogenesis_file_name, timeStr, "csv_cyclogenesis");
        const processedData = processFNV3CSVDataEnhanced(filePath);
        const mgTClist = processedData.data;
        for(let mgTC of mgTClist){
            save2DB(mgTC).catch(err=>{throw err});
        }

        return processedData;
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
    const timeList = getLatestModelTimeList(4);
    for(let time of timeList){
        try {
            console.log(time.format('YYYYMMDD HH:mm:ss'));
            await downloadData(time);
            await downloadOtherData(time);
        } catch (error) {
            console.error(`Error processing time ${time.format('YYYYMMDD HH:mm:ss')}:`, error.message);
            continue;
        }
    }
}

async function initDB(){
    process.env['NODE_ENV'] = 'production';
    await connect();
    initSchemas();
    save2DB = require('./db/util.db.js').save2DB;
  
    let ruleI1 = new schedule.RecurrenceRule();
    ruleI1.minute = [new schedule.Range(1, 59, 20)];// 20分钟轮询
    let job1 = schedule.scheduleJob(ruleI1, (fireDate)=>{
      // TODO 检测是否连接上mongodb
      console.log('轮询开始'+fireDate.toString());
      main()
        .then(()=>{
          console.log('轮询完毕');
        })
        .catch(err=>{
          console.trace(err);
        });
    });
    return main()
      .catch(err=>{
        console.trace(err);
      });
}
  
initDB().catch(err=>{
  console.trace(err);
})