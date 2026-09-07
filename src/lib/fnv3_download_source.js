const fs = require('fs');
const path = require('path');

function loadProjectEnv() {
    const envPath = path.resolve(__dirname, '../../.env');
    if (!fs.existsSync(envPath)) {
        return;
    }
    const lines = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq <= 0) {
            continue;
        }
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

loadProjectEnv();

const BASE_URL_MIRROR = 'http://deepmind.gdmo.gq';
const BASE_URL_ORIGINAL = 'https://deepmind.google.com';
const BASE_URL_PROXY = 'https://proxy.minhill.com';

function buildOriginalUrl(resourcePath) {
    return `${BASE_URL_ORIGINAL}${resourcePath}`;
}

function buildCycloneFileNames(model, timeStr) {
    return {
        tcfa: `${model}_${timeStr}_atcf_a_deck.txt`,
        paired: `${model}_${timeStr}_paired.csv`,
        cyclogenesis: `${model}_${timeStr}_cyclogenesis.csv`,
    };
}

function buildCycloneResourcePath(model, productPath, fileName) {
    return `/science/weatherlab/download/cyclones/${model}/${productPath}/${fileName}`;
}

function buildDownloadRequest(resourcePath, baseUrl) {
    const originalUrl = buildOriginalUrl(resourcePath);
    if (baseUrl === BASE_URL_PROXY) {
        const key = process.env.proxy_minhill_key;
        if (!key) {
            throw new Error('缺少 proxy_minhill_key，请在项目根目录 .env 中配置');
        }
        return {
            uri: `${BASE_URL_PROXY}/proxy?url=${encodeURIComponent(originalUrl)}`,
            headers: {
                Authorization: `Bearer ${key}`,
            },
        };
    }
    return {
        uri: `${baseUrl}${resourcePath}`,
    };
}

module.exports = {
    BASE_URL_MIRROR,
    BASE_URL_ORIGINAL,
    BASE_URL_PROXY,
    buildOriginalUrl,
    buildDownloadRequest,
    buildCycloneFileNames,
    buildCycloneResourcePath,
};
