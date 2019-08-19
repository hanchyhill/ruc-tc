// https://www.emc.ncep.noaa.gov/gmb/tpm/emchurr/tcgen/atx/storms.aeperts.atcf_gen.wptg.2019081818
const rp = require('request-promise-native');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const toArray = require('dayjs/plugin/toArray');
const resolveTCFA = require('./lib/resolveTCFA.js').resolveTCFA;
const {pMakeDir,isExists,readFile,writeFile} = require('./lib/util.js');
const {connect,initSchemas} = require('./db/initDB.js');
const schedule = require('node-schedule');
dayjs.extend(toArray);
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);
let config = {
  listUrl:'https://www.emc.ncep.noaa.gov/gmb/tpm/emchurr/tcgen/datebar.html',
  wpUrlPrefix:'https://www.emc.ncep.noaa.gov/gmb/tpm/emchurr/tcgen/atx/storms.aeperts.atcf_gen.wptg.',
  fileName(date){return 'storms.aeperts.atcf_gen.wptg.'+date+'.txt'},
}

async function readLocal(){
  let txt = await readFile('./demo/storms.aeperts.atcf_gen.wptg.2019081818.txt');
  let stormList = splitBul(txt.toString());
}

function splitBul(str=''){
  let lines = str.split('\n').filter(txt=>txt.includes(','));
  // console.log(lines);
  if(lines.length===0) return new Error('empety');
  let newLines = lines.
    map(line=>line.split(',')).
    map(line=>line.map(cell=>cell.trim()));
  newLines.forEach(line=>line.splice(2,1));
  let stormList = [];
  let stormName = [];
  for(let line of newLines){// 按编号归类不同气旋
    let name = line[1];
    let index = stormName.findIndex(v=>v===name);
    if(index!==-1){
      stormList[index].push(line);
    }else{//不存在的话
      stormList.push([line]);
      stormName.push(name);
    }
  }
  return stormList;
}
// readLocal()
//   .catch(err=>{
//     throw err;
//   })


const getLatestList = async ()=>{
  let url = config.listUrl;
  let htmlBody;
  let rpOption = {
    uri: url,
    timeout: 40*1000,
  }
  try{
    htmlBody = await rp(rpOption);
  }catch(err){
    console.error(err);
    throw new Error(`fetch ${url} error`);
  }
  const $ = cheerio.load(htmlBody);
  let hrefList = $('a');
  let dateList = [];
  hrefList.each(function(i, elem) {
    dateList.push($(this).text().trim());
  });
  dateList.shift();
  let leastLinks = dateList.slice(0,3);//获取前3个时次
  return leastLinks;
}

const main = async ()=>{
  let need2DownloadList = await getLatestList();
  for(let date of need2DownloadList){
    let rpOption = {uri: config.wpUrlPrefix + date,timeout: 40*1000,};
    let initTime = dayjs.utc(date,'YYYYMMDDHH');
    let dirPath = path.resolve(__dirname+'./../../data/cyclone/emc/ncep/',date.slice(0,4));
    // TODO 检查是否存在;
    let bulletinRaw;
    let fileName = config.fileName(date);
    try{
      await pMakeDir(dirPath);//创建不存在的目录
      const filePath = path.resolve(dirPath, fileName);
      let isFileExists = await isExists(filePath);// 文件路径
      if(!isFileExists){
        try{
          console.log('准备下载'+fileName);
          bulletinRaw = await rp(rpOption);
        }catch(err){
          console.error('下载文件发生意外'+fileName);
          throw err;
        }
        writeFile(filePath, bulletinRaw)
          .catch(err=>{console.log(err)});
      }else{
        // myDebug(`文件已存在${RegArr[2]}`);
        continue;
      }
    }
    catch(err){
      console.log(err);
    };
    let stormList = splitBul(bulletinRaw);
    // console.log(stormList.length);
  }
}

main()
  .catch(err=>console.error(err));