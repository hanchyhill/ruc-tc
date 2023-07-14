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
  fileName(date, prefix='storms.aeperts.atcf_gen.wptg.'){return prefix+date+'.txt'},
  insInfo:{
    'NCEPEns':{
      prefix:'storms.aeperts.atcf_gen.wptg.'
    },
    'GFS':{
      prefix:'storms.gfso.atcf_gen.wptg.',
    },
    'NCEP35-dayEns':{
      prefix:'storms.gxperts.atcf_gen.wptg.',
    },
    'Ukmet':{
      prefix:'storms.ukx.atcf_gen.wptg.',
    },
    'Ukmet':{
      prefix:'storms.ukx.atcf_gen.wptg.',
    },
    'NAVGEM':{
      prefix:'storms.ngx.atcf_gen.wptg.',
    },
    'FNMOCEns':{
      prefix:'storms.feperts.atcf_gen.wptg.',
    },
    'CMC':{
      prefix:'storms.cmc.atcf_gen.wptg.',
    },
    'CMCEns':{
      prefix:'storms.ceperts.atcf_gen.wptg.',
    },

  },


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

/**
 * 从'https://www.emc.ncep.noaa.gov/gmb/tpm/emchurr/tcgen/datebar.html'获取最近三个时次的url
 * @returns 
 */
const getLatestList = async (itemNumber=10)=>{
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
  let leastLinks = dateList.slice(0,itemNumber);//获取前N个时次
  return leastLinks;
}

const main = async ()=>{
  let need2DownloadList = await getLatestList(10);// 从左侧bar获取最近10个时次的
  for(let date of need2DownloadList){// date = []
    let rpOption = {uri: config.wpUrlPrefix + date, timeout: 40*1000,};// 报文下载地址https://www.emc.ncep.noaa.gov/gmb/tpm/emchurr/tcgen/atx/storms.feperts.atcf_gen.wptg.2023071200
    let initTime = dayjs.utc(date,'YYYYMMDDHH');
    let dirPath = path.resolve(__dirname+'./../../data/cyclone/emc/ncep/',date.slice(0,4));
    // 检查本地文件是否存在;
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
          if(err.statusCode===404){
            console.log('远程文件不存在'+rpOption.uri);
            continue
          }else{
            console.error('下载文件发生意外'+fileName);
            throw err;
          }
        }
        writeFile(filePath, bulletinRaw)
          .then(()=>{
            console.log(`文件已保存${fileName}`);
          })
          .catch(err=>{console.log(err)});
      }else{
        console.log(`文件已存在${fileName}`);
        continue;
      }
    }
    catch(err){
      console.log(err);
    };
    if(!bulletinRaw){
      //TODO 准备解析
      // let stormList = splitBul(bulletinRaw);
    }
    
    // console.log(stormList.length);
  }
}

main()
  .catch(err=>console.error(err));

// 定时触发
let ruleI1 = new schedule.RecurrenceRule();
ruleI1.minute = [new schedule.Range(1, 59, 20)];// 20分钟轮询
let job1 = schedule.scheduleJob(ruleI1, (fireDate)=>{
  console.log('轮询开始'+fireDate.toString());
  main()
    .then(()=>{
      console.log('轮询完毕');
    })
    .catch(err=>{
      console.trace(err);
    });
});


