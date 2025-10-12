const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const fs = require('fs');
const path = require('path');
const {get_aifs, trans_aifs_to_mongo_format} = require('./lib/get_aifs.js');
const schedule = require('node-schedule');
const {connect, initSchemas} = require('./db/initDB.js');
const process = require('process');

let save2DB;

// Determine environment: Windows or Linux
const isWindows = process.platform === 'win32';
let BASE_DIR;

if (isWindows) {
    BASE_DIR = "\\\\10.148.44.81\\data_hpc\\typhoon\\aifs_cai";
} else {
    BASE_DIR = "/var/www/html/data/cyclone/aifs_cai";
}

/**
 * Save data to file
 * @param {Object} data - Data object to save
 * @param {string} filename - Filename
 * @param {string} timeStr - Time string (format: YYYYMMDDHH)
 * @param {string} type - Data type subdirectory
 * @returns {string} Saved file path
 */
function saveDataToFile(data, filename, timeStr, type = "ensemble") {
    const base_path = BASE_DIR;
    // Extract year and month from timeStr (format: YYYYMMDDHH)
    const yearMonth = timeStr.substring(0, 6); // Extract YYYYMM
    const fileName = filename;
    const filePath = path.join(base_path, type, yearMonth, fileName);

    // Ensure directory exists
    fs.mkdirSync(path.join(base_path, type, yearMonth), { recursive: true });

    // Write file (JSON format)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to: ${filePath}`);

    return filePath;
}

/**
 * Check if file exists
 * @param {string} filename - Filename
 * @param {string} timeStr - Time string (format: YYYYMMDDHH)
 * @param {string} type - Data type subdirectory
 * @returns {boolean} Whether file exists
 */
function checkFileExists(filename, timeStr, type = "ensemble") {
    const base_path = BASE_DIR;
    // Extract year and month from timeStr (format: YYYYMMDDHH)
    const yearMonth = timeStr.substring(0, 6); // Extract YYYYMM
    const filePath = path.join(base_path, type, yearMonth, filename);

    return fs.existsSync(filePath);
}

/**
 * Download and process AIFS data
 * @param {dayjs.Dayjs} date - dayjs date object
 * @param {string} area - Area name
 * @returns {Promise<Object|null>} Processed data or null
 */
async function downloadData(date, area = "WesternPacific") {
    try {
        const timeStr = date.format('YYYYMMDDHH');
        const filename = `AIFS_${timeStr}_${area}.json`;

        // Check if file already exists
        if (checkFileExists(filename, timeStr, "ensemble")) {
            console.log(`File ${filename} already exists for ${timeStr}, skipping download`);
            return null;
        }

        console.log(`Preparing to download AIFS data: ${timeStr}, area: ${area}`);

        // Call get_aifs to fetch data
        const rawData = await get_aifs(timeStr, area);

        // Save raw data
        const filePath = saveDataToFile(rawData, filename, timeStr, "ensemble");
        // console.log(`Raw data saved: ${filePath}`);

        // Convert to MongoDB format
        const processedData = trans_aifs_to_mongo_format(rawData);
        console.log(`Successfully converted ${processedData.length} typhoon data records`);

        // Save to database
        for (let mgTC of processedData) {
            await save2DB(mgTC).catch(err => {
                console.error(`Failed to save data to database:`, err.message);
                throw err;
            });
        }

        return processedData;
    } catch (error) {
        console.error(`Failed to download data for ${date.format('YYYY-MM-DD HH:mm:ss')}:`, error.message);
        return null;
    }
}

/**
 * Get latest model time
 * AIFS model times are 00UTC, 06UTC, 12UTC, and 18UTC daily (6-hour intervals)
 * @returns {dayjs.Dayjs} Latest model time
 */
function getLatestModelTime(){
    const now = dayjs.utc();
    const hour = now.hour();

    // Determine the most recent 6-hour interval
    if (hour >= 18) {
        // 18UTC
        return now.hour(18).minute(0).second(0).millisecond(0);
    } else if (hour >= 12) {
        // 12UTC
        return now.hour(12).minute(0).second(0).millisecond(0);
    } else if (hour >= 6) {
        // 06UTC
        return now.hour(6).minute(0).second(0).millisecond(0);
    } else {
        // 00UTC
        return now.hour(0).minute(0).second(0).millisecond(0);
    }
}

/**
 * Get list of latest model times
 * @param {number} list_count - Number of time points to retrieve
 * @returns {Array<dayjs.Dayjs>} Time list
 */
function getLatestModelTimeList(list_count = 4) {
    let latestModelTime = getLatestModelTime();
    let timeList = [];

    for (let i = 0; i < list_count; i++) {
        timeList.push(latestModelTime.subtract(i * 6, 'hour')); // 6-hour intervals
    }

    return timeList;
}

/**
 * Main function: batch download data for multiple time points
 * @param {string} area - Area name
 */
async function main(area = "WesternPacific") {
    const timeList = getLatestModelTimeList(4);
    for (let time of timeList) {
        try {
            console.log(`Processing time: ${time.format('YYYYMMDD HH:mm:ss')}`);
            await downloadData(time, area);
        } catch (error) {
            console.error(`Error processing time ${time.format('YYYYMMDD HH:mm:ss')}:`, error.message);
            continue;
        }
    }
}

/**
 * Initialize database connection and start scheduled tasks
 */
async function initDB() {
    process.env['NODE_ENV'] = 'production';
    await connect();
    initSchemas();
    save2DB = require('./db/util.db.js').save2DB;

    // Set scheduled task: poll every 30 minutes
    let ruleI1 = new schedule.RecurrenceRule();
    ruleI1.minute = [new schedule.Range(1, 59, 30)]; // 30-minute polling
    schedule.scheduleJob(ruleI1, (fireDate) => {
        console.log('AIFS polling started: ' + fireDate.toString());
        main()
            .then(() => {
                console.log('AIFS polling completed');
            })
            .catch(err => {
                console.trace(err);
            });
    });

    // Execute immediately once
    return main()
        .catch(err => {
            console.trace(err);
        });
}

// Start application
initDB().catch(err => {
    console.trace(err);
});
