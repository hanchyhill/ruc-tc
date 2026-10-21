// https://www.emc.ncep.noaa.gov/gmb/tpm/emchurr/tcgen/atx/storms.aeperts.atcf_gen.wptg.2019081818
const rp = require('request-promise-native');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tcfa2mongo = require('./lib/emc_TCFA.js').tcfa2mongo;
const {pMakeDir,isExists,writeFile} = require('./lib/util.js');
const {connect,initSchemas} = require('./db/initDB.js');
const schedule = require('node-schedule');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);
let save2DB;
const ins_wanted = ['GFS', 'NCEPEns', 'FNMOCEns','CMCEns','Ukmet'];
let config = {
  wpUrlPrefix:'https://www.emc.ncep.noaa.gov/gmb/tpm/emchurr/tcgen/atx/',
  fileName(date, prefix='storms.aeperts.atcf_gen.wptg.'){return prefix+date+'.txt'},
  insInfo:{
    'NCEPEns':{
      prefix:'storms.aeperts.atcf_gen.wptg.',
      ins:'ncep_e',
      dir:'ncep',
    },
    'GFS':{
      prefix:'storms.gfso.atcf_gen.wptg.',
      ins:'ncep_e',
      dir:'ncep',
    },
    'NCEP35-dayEns':{
      prefix:'storms.gxperts.atcf_gen.wptg.',
      dir:'ncep',
    },
    'Ukmet':{
      prefix:'storms.ukx.atcf_gen.wptg.',
      ins:'ukmo_e',
      dir:'ukmo',
    },
    'NAVGEM':{
      prefix:'storms.ngx.atcf_gen.wptg.',
      ins:'fnmoc_e',
      dir:'fnmoc',
    },
    'FNMOCEns':{
      prefix:'storms.feperts.atcf_gen.wptg.',
      ins:'fnmoc_e',
      dir:'fnmoc',
    },
    'CMC':{
      prefix:'storms.cmc.atcf_gen.wptg.',
      ins:'cmc_e',
      dir:'cmc',
    },
    'CMCEns':{
      prefix:'storms.ceperts.atcf_gen.wptg.',
      ins:'cmc_e',
      dir:'cmc',
    },

  },


}

/**
 * EMC 的 datebar.html 可能停止更新，但 atx 报文仍然发布。
 * 直接探测最近 N 个 UTC 00/06/12/18 时次；未发布的报文留待下次轮询。
 */
function getLatestList(itemNumber = 10, now = dayjs.utc()) {
  if (!Number.isInteger(itemNumber) || itemNumber < 1) {
    throw new Error('itemNumber must be a positive integer');
  }
  const time = dayjs.utc(now);
  if (!time.isValid()) throw new Error('Invalid EMC cycle time');
  const latest = time.startOf('day').add(Math.floor(time.hour() / 6) * 6, 'hour');
  return Array.from({ length: itemNumber }, (_, index) =>
    latest.subtract(index * 6, 'hour').format('YYYYMMDDHH'));
}

async function downloadbyIns(ins, dates, options = {}) {
  const request = options.request || rp;
  const save = options.save || save2DB;
  const dataRoot = options.dataRoot || path.resolve(__dirname, '../../data/cyclone/emc');
  let failures = 0;
  for (const date of dates) {
    const info = config.insInfo[ins];
    const uri = config.wpUrlPrefix + info.prefix + date;
    const fileName = config.fileName(date, info.prefix);
    const dirPath = path.resolve(dataRoot, info.dir, date.slice(0, 4));
    const filePath = path.resolve(dirPath, fileName);
    try {
      await pMakeDir(dirPath);
      if (await isExists(filePath)) {
        console.log(`文件已存在${fileName}`);
        continue;
      }
      console.log('准备下载' + fileName);
      const bulletinRaw = await request({ uri, timeout: 40 * 1000 });
      // 空报文可以表示无气旋；HTML 错误页等响应不可作为成功下载缓存。
      if (bulletinRaw.trim() && !/^\s*(?:TG|WP),/m.test(bulletinRaw)) {
        throw new Error('Invalid EMC bulletin: ' + uri);
      }
      const mgTClist = tcfa2mongo(bulletinRaw, info.ins);
      for (const mgTC of mgTClist) await save(mgTC);
      // 入库成功后再缓存；失败时下次轮询仍能重试。
      await writeFile(filePath, bulletinRaw);
      console.log(`文件已保存${fileName}，入库${mgTClist.length}条`);
    } catch (err) {
      if (err.statusCode === 404) {
        console.log('远程文件不存在' + uri);
      } else {
        failures++;
        console.error('处理文件失败 ' + fileName, err);
      }
    }
  }
  return failures;
}

async function main(dates = getLatestList(10), options = {}) {
  let failures = 0;
  console.log('检查 EMC 时次: ' + dates.join(', '));
  for (const ins of ins_wanted) {
    failures += await downloadbyIns(ins, dates, options);
  }
  if (failures) throw new Error(`EMC 有 ${failures} 个文件处理失败，后续轮询将重试`);
}

async function initDB(){
  process.env['NODE_ENV'] = 'production';
  await connect();
  initSchemas();
  save2DB = require('./db/util.db').save2DB;
  let running = false;
  async function poll() {
    if (running) {
      console.log('上一轮 EMC 轮询尚未结束，跳过本轮');
      return;
    }
    running = true;
    try {
      await main();
      console.log('轮询完毕');
    } catch (err) {
      console.trace(err);
    } finally {
      running = false;
    }
  }

  let ruleI1 = new schedule.RecurrenceRule();
  ruleI1.minute = [new schedule.Range(1, 59, 20)];// 20分钟轮询
  let job1 = schedule.scheduleJob(ruleI1, (fireDate)=>{
    // TODO 检测是否连接上mongodb
    console.log('轮询开始'+fireDate.toString());
    poll();
  });
  return poll();
}

module.exports = { getLatestList, downloadbyIns, main };

if (require.main === module) {
  initDB().catch(err => { console.trace(err); });
}


