const fs = require('fs');
const { pMakeDir, isExists, readFile, writeFile } = require('../lib/util.js');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);
/**
 * 分组 数据
 * @param {Array} allRecords 记录
 */
function groupRecord(allRecords = []) {
    let typeList = [];
    let sortList = [];
    let idList = [];
    // 分组
    for (let line of allRecords) {

        let cType = line.type; // current type
        let tcID = line.basinshort + line.number;// current ID
        const doesIncludeType = typeList.includes(cType);
        const doesIncludeID = idList.includes(tcID);
        if (doesIncludeType && doesIncludeID) {// 同一个集合成员，同一个台风ID，则并入同一list中
            let cItem = sortList.find(item => item.oriType == cType && item.shortID == tcID);
            cItem.trackList.push(line);
        } else {
            sortList.push(
                {
                    oriType: cType,
                    shortID: tcID,
                    trackList: [line],
                }
            );
            typeList.push(cType);
            idList.push(tcID);
        }
    }
    let oriType = ['AC00','APxx','GFSO']// AC00控制预报，GFSO确定性预报
    return sortList;
}

/**
 * 去除重复的时间
 * @param {Array} track 路径
 */
function trimDuplicateTime(trackList = [{ step: 0 }]) {
    let newTrack = [];
    let timeList = [];
    for (let line of trackList) {
        let iTime = line.step;
        if (!timeList.includes(iTime)) {
            newTrack.push(line);
            timeList.push(iTime);
        } else {
            continue;
        }
    }
    return newTrack;
}

function splitBul(str = '') {
    let lines = str.split('\n').filter(txt => txt.includes(','));
    // console.log(lines);
    if (lines.length === 0) return new Error('empety');
    let newLines = lines.
        map(line => line.split(',')).
        map(line => line.map(cell => cell.trim()));
    newLines.forEach(line => line.splice(2, 1));
    let stormList = [];
    let stormName = [];
    for (let line of newLines) {// 按编号归类不同气旋
        let name = line[1];
        let index = stormName.findIndex(v => v === name);
        if (index !== -1) {
            stormList[index].push(line);
        } else {//不存在的话
            stormList.push([line]);
            stormName.push(name);
        }
    }
    let allInfo = stormList.map(storm => {
        let line = storm[0];
        let basin = line[0];
        let stormName = line[1];
        return {
            basin,
            stormName,
            lines: storm,
        }
    })
    return allInfo;
}
/**
 * 解析经纬度
 * @param {String} str 经纬度字符串
 * @returns {Number} 转换后的经纬度
 */
function transLatLon(str='120N'){
    const numStr = str.slice(0,-1);
    const flag = str.slice(-1);
    const unsignedNum = Number(numStr)/10.0;
    const sign = flag.toUpperCase() =='N'||  flag.toUpperCase() =='E'? 1 : -1;
    return unsignedNum*sign;
  }

function transLines(newLines, ins = 'ecmwf') {

    let allRecords = newLines.map(line => {
        let basinshort = line[0];
        let number = line[1];
        let time = dayjs.utc(line[2], 'YYYYMMDDHH').toDate();
        let type = line[4];
        let step = Number(line[5]);
        let lat = transLatLon(line[6]);
        let lon = transLatLon(line[7]);
        let wind = Number(line[8]) * 0.5144;
        let pres = Number(line[9]);
        return {
            basinshort,
            number,
            time,
            step,
            type,
            lat,
            lon,
            wind,
            pres,
        }
    });

    let sortList = groupRecord(allRecords);
    sortList.forEach(tc => tc.ins = ins);
    sortList.forEach(v => v.trackList = trimDuplicateTime(v.trackList));
    // sortList.forEach(v => v.type = setTcType(v.oriType, selectConfig(ins)));//
    // sortList = sortList.filter(v => {// 去除无法识别的类型
    //     if (v.type === false) {
    //         console.error('无法识别的类型:');
    //         console.error(v);
    //         return false;
    //     } else {
    //         return true;
    //     }
    // });
    // console.log(sortList);
    // sortList = trimDuplicateDetTrack(sortList);
    return sortList;
    // return trans2mongoFormat(sortList);
}

async function main() {
    rawText = await readFile(path.join(__dirname, '../demo/storms.aeperts.atcf_gen.wptg.2023071400.txt'));
    let allInfo = splitBul(rawText.toString());
    console.log(allInfo);
    // filter allInfo, drop the stormName is not start with digital Number
    const regex = /\d$/;
    let filter_info = allInfo.filter(storm => {
        let found = regex.test(storm.stormName);
        return !found;
    });
    console.log(filter_info);
    for (let storm of filter_info) {
        transLines(storm.lines);
    }
}

main()