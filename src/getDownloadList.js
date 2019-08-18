const rp = require('request-promise-native');
// const tough = require('tough-cookie');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const toArray = require('dayjs/plugin/toArray');
const resolveTCFA = require('./lib/resolveTCFA.js').resolveTCFA;
const {pMakeDir,isExists,writeFile} = require('./lib/util.js');

dayjs.extend(toArray);
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);

const readFileList = async function(url='https://ruc.noaa.gov/hfip/tceps/2019/2019070200/'){
  console.log('读取列表'+url);
  let reqConfig = {
    uri:url,
    timeout:30*1000
  }
  let htmlBody;
  try{
    htmlBody = await rp(reqConfig);
  }catch(err){
    console.error('读取文件列表发生错误'+url);
    throw err;
  }
  
  const $ = cheerio.load(htmlBody);
  let hrefList = $('td a');
  let links = [];
  hrefList.each(function(i, elem) {
    links.push($(this).attr('href'));
  });
  // console.log(links);
  let downloadList = links.filter(url=>url.includes('adeck'));
  let listInfo = [];
  for(let href of downloadList){
    let insFlag = href.match(/adeck\.(.*?)\./);// insFlag[1];
    let timeString = href.match(/\d{10}/);
    console.log(href);
    // console.log(timeString[0]);
    let utcTime = dayjs.utc(timeString[0],'YYYYMMDDHH');
    if(!insFlag) continue;
    let meta = {
      fileName:href,
      time:utcTime.toDate(),
      url: url + href
    }
    if(insFlag[1]==='ncep'){
      let ins = 'ncep';
      meta.ins = ins;
      listInfo.push(meta);
    }else if(insFlag[1]==='ecmb'){
      let ins = 'ecmwf';
      meta.ins = ins;
      listInfo.push(meta);
    }else if(insFlag[1]==='ukmo'){
      let ins = 'ukmo';
      meta.ins = ins;
      listInfo.push(meta);
    }
    else if(insFlag[1]==='cmc'){
      let ins = 'cmc';
      meta.ins = ins;
      listInfo.push(meta);
    }
    else{
      continue;
    }
  }
  listInfo = listInfo.filter(meta=>meta.ins==='ncep'||meta.ins==='ecmwf');// TODO 增加UKMO机构报文
  // let need2DownlodList = [];

  // console.log(listInfo);
  for(let fiMeta of listInfo){
    // 文件夹路径
    let dirPath = path.resolve(__dirname+'./../../data/cyclone/ruc/',fiMeta.ins,fiMeta.time.getFullYear().toString(),dayjs.utc(fiMeta.time).format('YYYYMMDDHH'));
    try{
      await pMakeDir(dirPath);//创建不存在的目录
      const filePath = path.resolve(dirPath,fiMeta.fileName);
      let isFileExists = await isExists(filePath);// 文件路径
      if(!isFileExists){
        try{
          await downloadFile({ins:fiMeta.ins,url:fiMeta.url,fileName:fiMeta.fileName,time:fiMeta.time,dirPath:dirPath});
        }catch(err){
          console.err('下载文件发生意外'+fiMeta.fileName);
          throw err;
        }
      }else{
        // myDebug(`文件已存在${RegArr[2]}`);
        continue;
      }
      
    }catch(err){
      console.error(err);
      continue;// 下载下一个文件
    }
  }
  // function download data
}

/**
 * 
 * @param {Object} { ins 机构 url 下载地址 fileName文件名 time 日期 path本地保存路径}
 */
async function downloadFile({ins='ncep',url='',fileName='adeck.ncep.02E.2019.2019070200.txt',time=new Date(),dirPath=''}){
  let reqConfig = {
    uri:url,
    timeout:30*1000
  }
  let htmlbody;
  try{
    htmlbody = await rp(reqConfig);
  }catch(err){
    throw err;
  }
  const filePath = path.resolve(dirPath, fileName);
  // console.log(filePath);
  let tcbul = resolveTCFA(htmlbody, ins);// TODO，1.过滤重复的确定性预报，2.整合成我们自己的集合预报格式
  fs.writeFile(filePath,htmlbody,(err)=>{// TODO，储存所选
    if(err) console.error(err);
    console.log(`下载${fileName}完毕`);
  });
  fs.writeFile(path.resolve(dirPath, fileName+'.json'),JSON.stringify(tcbul,null,2),(err)=>{// TODO，储存所选
    if(err) console.error(err);
  });
}

const prepareDownload = async ()=>{
  let now = dayjs.utc();
  let cYear = now.year();
  let dirUrl = `https://ruc.noaa.gov/hfip/tceps/${cYear}/?C=M;O=A`;
  let rpOption = {
    uri:dirUrl,
    timeout:30*1000,
  }
  let htmlBody;
  try{
    htmlBody = await rp(rpOption);
  }catch(err){
    console.error(err);
    throw new Error(`fetch ${dirUrl} error`);
  }
  
  const $ = cheerio.load(htmlBody);
  let hrefList = $('td a');
  let links = [];
  hrefList.each(function(i, elem) {
    links.push($(this).attr('href'));
  });
  let leastLinks = links.slice(-2);
  for(let link of leastLinks){
    let url = `https://ruc.noaa.gov/hfip/tceps/${cYear}/${link}`;
    try{
      await readFileList(url);
    }catch(err){
      console.error(err);
      continue;
      // throw new Error(`fetch ${url} error`);
    }
  }
  //console.log(leastLinks);
  //https://ruc.noaa.gov/hfip/tceps/2019/

  // TODO: 确定时间
}

prepareDownload()
.catch(err=>{
  console.error(err);
})

