const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline'); // 시리얼 데이터 파싱
const Store = require('electron-store'); // local Storage

const log = require('electron-log'); // 로그 기록
const net = require('net'); // 소켓 서버통신

const CONSTANT = require('./util/constant');
const { scaleFlag, uartFlag, basicConfigFlag, externalPrintConfigFlag, calibrationConfigFlag } = require('./util/flag');

const os = require('os'); // 운영체제 확인
const platforms = {
    WINDOWS: 'WINDOWS',
    MAC: 'MAC',
    LINUX: 'LINUX',
    SUN: 'SUN',
    OPENBSD: 'OPENBSD',
    ANDROID: 'ANDROID',
    AIX: 'AIX'
};
const platformsNames = {
    win32: platforms.WINDOWS,
    darwin: platforms.MAC,
    linux: platforms.LINUX,
    sunos: platforms.SUN,
    openbsd: platforms.OPENBSD,
    android: platforms.ANDROID,
    aix: platforms.AIX,
};

let sp;
let win;
let configWin;
let pcConfigWin;
let scale = new scaleFlag();
let pcConfig = new uartFlag();
let serialConfig = new uartFlag();
let basicConfig = new basicConfigFlag();
let externalPrintConfig = new externalPrintConfigFlag();
let calibrationConfig = new calibrationConfigFlag();
let currentPlatform;
let decimalPoint = 0;
let socketServer;

const createWindow = function() {
    log.info('function: createWindow');
    // 브라우저 창을 생성합니다.
    win = new BrowserWindow({
        width: CONSTANT['WINDOW_WIDTH'],
        height: CONSTANT['WINDOW_HEIGHT'],
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        },
        frame: false,
        fullscreen: false
    })
    win.loadFile('index.html');

    win.webContents.on('did-finish-load', () => {
        pcConfigGetLocalStorage();
    })

    currentPlatform = platformsNames[os.platform()];
    log.info('OS:', currentPlatform);
}

const openConfigWindow = function() {
    log.info('function: openConfigWindow');
    // 브라우저 창을 생성합니다.
    configWin = new BrowserWindow({
        parent: win,
        width: CONSTANT['WINDOW_WIDTH'],
        height: CONSTANT['WINDOW_HEIGHT'],
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        },
        frame: false,
        fullscreen: false
    })

    configWin.loadFile('view/config.html');
    configWin.webContents.on('did-finish-load', () => {
        setTimeout(function() {
            getSerialConfig();
            getRomVer();
        }, CONSTANT['FIVE_HUNDRED_MS']);
    })
}

const openPCConfigWindow = function() {
    log.info('function: openPCConfigWindow');
    // 브라우저 창을 생성합니다.
    pcConfigWin = new BrowserWindow({
        parent: win,
        width: CONSTANT['WINDOW_WIDTH'],
        height: CONSTANT['WINDOW_HEIGHT'],
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        },
        frame: false,
        fullscreen: false
    })

    pcConfigWin.loadFile('view/pcconfig.html');

    // PC설정 화면 로드 완료되면 포트 목록 호출 및 PC설정 데이터 전송
    pcConfigWin.webContents.on('did-finish-load', () => {
        // 포트목록 불러오기
        SerialPort.list().then(
            ports => {
                pcConfigWin.webContents.send('port_list', ports);
                pcConfigWin.webContents.send('pc_config_get_data', pcConfig)
            }
        );
    })
}

const pcConfigGetLocalStorage = function(event) {
    log.info('function: pcConfigGetLocalStorage');
    const localStorage = new Store();
    if(localStorage.get('pc_config') == undefined) {
        if(currentPlatform == 'WINDOWS') {
            localStorage.set('pc_config.port', CONSTANT['DEFAULT_SERIAL_PORT_WINDOW']);
        }
        else {
            localStorage.set('pc_config.port', CONSTANT['DEFAULT_SERIAL_PORT_LINUX']);
        }

        localStorage.set('pc_config.baudrate', 24);
        localStorage.set('pc_config.databits', 8);
        localStorage.set('pc_config.parity', CONSTANT['PARITY_NONE']);
        localStorage.set('pc_config.stopbits', 1);
        localStorage.set('pc_config.terminator', CONSTANT['CRLF']);
        localStorage.set('pc_config.fontcolor', CONSTANT['FONT_COLOR_BLUE']);

        win.webContents.send('set_font_color', CONSTANT['FONT_COLOR_BLUE']);
    }
    else {
        let tmpConfig = localStorage.get('pc_config');
        pcConfig.port = tmpConfig.port;
        pcConfig.baudrate = tmpConfig.baudrate;
        pcConfig.databits = tmpConfig.databits;
        pcConfig.parity = tmpConfig.parity;
        pcConfig.stopbits = tmpConfig.stopbits;
        pcConfig.terminator = tmpConfig.terminator;
        pcConfig.fontcolor = tmpConfig.fontcolor;

        win.webContents.send('set_font_color', tmpConfig.fontcolor);
    }
}

const setStreamMode = function() {
    log.info('function: setStreamMode');
    // 201204 AD모듈 붙이면서 스트림 모드 명령어 F205,1로 변경됨
    const command = 'F205,1' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: F206,1');
            log.error(err);
            return;
        }
    });
}

const setCommandMode = function() {
    log.info('function: setCommandMode');
    // 201204 AD모듈 붙이면서 커맨드 모드 명령어 F205,2로 변경됨
    const command = 'F205,2' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: F206,2');
            log.error(err);
            return;
        }
        openConfigWindow();
    });
}

const commandRsset = function() {
    log.info('function: commandRsset');
    let command = 'RSSET' + '\r\n';

    scale.f = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: RSSET');
            log.error(err);
            serialConfig = new uartFlag();
            configWin.webContents.send('set_serial_config_data', 'fail');
            return;
        }
    })
}

const resultSetok = function(){
    const localStorage = new Store();

    localStorage.set('pc_config.baudrate', serialConfig.baudrate);
    localStorage.set('pc_config.databits', serialConfig.databits);
    localStorage.set('pc_config.parity', serialConfig.parity);
    localStorage.set('pc_config.stopbits', serialConfig.stopbits);
    localStorage.set('pc_config.terminator', serialConfig.terminator);

    pcConfig.baudrate = serialConfig.baudrate;
    pcConfig.databits = serialConfig.databits;
    pcConfig.parity = serialConfig.parity;
    pcConfig.stopbits = serialConfig.stopbits;
    pcConfig.terminator = serialConfig.terminator;

    configWin.webContents.send('set_serial_config_data', 'ok');

    try {
        sp.close(function(err){
            if(err) {
                log.error('error: SETOK');
                log.error(err);
                return;
            }
            log.info('closed');
            startProgram();
        });
    }
    catch(e) {
        log.error('Cannot open port.');
        log.error(e);
    }
}

const commandOk = function() {
    log.info('function: commandOk');
    let command = 'OK' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: OK');
            log.error(err);
            return;
        }
    })
}

ipcMain.on('set_comp_value', (event, data) => {
    log.info('ipcMain.on: set_comp_value');

    let compFlag = data['flag'];
    let compValue = data['value'];

    // 커맨드 모드로 진입
    log.info('command: F205,2');
    let command = 'F205,2' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: F205,2');
            log.error(err);
            return;
        }

        // 데이터 총 7바이트 전송
        command = 'WDS' + (compFlag+1).toString() + ',' ;

        // 부호 결정
        if(compValue > 0) {
            command = command + '+';
        }
        else {
            command = command + '-';
        }

        // 부호 제외 6자리 맞추기
        let compValueLength = compValue.toString().length;
        let sendValue = compValue.toString().replace('.', '');

        for(let i = 0; i < 6 - compValueLength; i++) {
            sendValue = '0' + sendValue;
        }

        command = command + sendValue + '\r\n';

        setTimeout(function(){
            log.info('command: WDS');
            sp.write(command, function(err){
                if(err) {
                    log.error('command: WDS');
                    log.error(err);
                    return;
                }

                setTimeout(function(){
                    if(compFlag == 0) {
                        scale.s1_value = compValue;
                    }
                    if(compFlag == 1) {
                        scale.s2_value = compValue;
                    }
                    if(compFlag == 2) {
                        scale.s3_value = compValue;
                    }
                    if(compFlag == 3) {
                        scale.s4_value = compValue;
                    }
                    if(compFlag == 4) {
                        scale.s5_value = compValue;
                    }

                    // 변경 완료 후 스트림 모드로 진입
                    log.info('command: F205,1');
                    command = 'F205,1' + '\r\n';
                    sp.write(command, function(err){
                        if(err) {
                            log.error('command: F205,1');
                            log.error(err);
                            return;
                        }
                        scale.comparator = true;
                    })
                }, CONSTANT['ONE_HUNDRED_MS'])
            })
        }, CONSTANT['ONE_HUNDRED_MS'])
    });
})

ipcMain.on('commandOk', (event, arg) => {
    log.info('ipcMain.on: commandOk');
})

const convertComparatorValue = function(value, dp) {
    log.info('function: convertComparatorValue');
    let result;
    result = value.toString().replace('.', '');
    result =
    Number(
        result.slice(0, result.length-dp)
        + '.'
        + result.slice(result.length-dp)
    ).toFixed(dp);

    return result;
}

const readHeader = function(rx) {
    const separator = ',';
    const splitedData = rx.split(separator);
    const splitedDataLength = splitedData.length;

    // 통신포맷
    if(splitedDataLength == 5) {
        if(rx.length < 20) {
            return;
        }

        const header1 = splitedData[0];
        const header2 = splitedData[1];
        const seqState = splitedData[2];
        const compState = splitedData[3];
        const body = splitedData[4];

        scale.isStable = false;
        scale.isHold = false;
        scale.isHg = false;
        scale.isNet = false;
        scale.isZero = false;
        scale.block = false;

        if(scale.comparator) {
            scale.comparator = false;
            scale.comparator_mode = 0;

            getDecimalPoint(Number(body).toString());

            setTimeout(function(){
                scale.s1_value = convertComparatorValue(scale.s1_value, decimalPoint);
                scale.s2_value = convertComparatorValue(scale.s2_value, decimalPoint);
                scale.s3_value = convertComparatorValue(scale.s3_value, decimalPoint);
                scale.s4_value = convertComparatorValue(scale.s4_value, decimalPoint);
                scale.s5_value = convertComparatorValue(scale.s5_value, decimalPoint);

                win.webContents.send('set_comp_value', scale);
            }, CONSTANT['ONE_HUNDRED_MS']);
        }

        scale.seqState = seqState;
        scale.compState = compState;
        scale.displayMsg = makeFormat(rx);

        // 안정
        if(header1 == 'ST') {
            scale.isStable = true;
            if(header2 == 'NT') {
                scale.isNet = true;
            }
        }

        // 불안정
        else if(header1 == 'US') {
            if(header2 == 'NT') {
                scale.isNet = true;
            }
        }

        // 홀드
        else if(header1 == 'HD') {
            scale.isHold = true;
        }

        // 홀드중
        else if (header1 == 'HG') {
            scale.isHold = true;
            scale.isHg = true;
        }

        // 오버
        else if (header1 == 'OL') {
            scale.displayMsg = '   .  ';
        }

        else {
            scale.block = true;
        }
        rx = '';
    }

    // 통신포맷 - seqstate, compstate 추가전
    if(splitedDataLength == 3) {
        if(rx.length < 16) {
            return;
        }

        const header1 = splitedData[0];
        const header2 = splitedData[1];
        // const seqState = splitedData[2];
        // const compState = splitedData[3];
        const body = splitedData[2];

        scale.isStable = false;
        scale.isHold = false;
        scale.isHg = false;
        scale.isNet = false;
        scale.isZero = false;
        scale.block = false;

        if(scale.comparator) {
            scale.comparator = false;
            scale.comparator_mode = 0;

            getDecimalPoint(Number(body).toString());

            setTimeout(function(){
                scale.s1_value = convertComparatorValue(scale.s1_value, decimalPoint);
                scale.s2_value = convertComparatorValue(scale.s2_value, decimalPoint);
                scale.s3_value = convertComparatorValue(scale.s3_value, decimalPoint);
                scale.s4_value = convertComparatorValue(scale.s4_value, decimalPoint);
                scale.s5_value = convertComparatorValue(scale.s5_value, decimalPoint);

                win.webContents.send('set_comp_value', scale);
            }, CONSTANT['ONE_HUNDRED_MS']);
        }

        scale.displayMsg = makeFormat(body);

        if(header1 == 'ST') {
            scale.isStable = true;
            if(header2 == 'NT') {
                scale.isNet = true;
            }
        }

        else if(header1 == 'US') {
            if(header2 == 'NT') {
                scale.isNet = true;
            }
        }

        else if(header1 == 'HD') {
            scale.isHold = true;
        }

        else if (header1 == 'HG') {
            scale.isHold = true;
            scale.isHg = true;
        }

        else if (header1 == 'OL') {
            scale.displayMsg = '   .  ';
        }

        else {
            scale.block = true;
        }
        rx = '';
    }

    // 컴퍼레이터 읽기, 쓰기, 모드
    // F펑션, CF펑션
    else if(splitedDataLength == 2) {
        const header = splitedData[0];
        const body = splitedData[1];

        // 컴퍼레이터 모드 진입
        if(header == 'COM') {
            scale.comparator = true;
            scale.comparator_mode = Number(body);

            // 모드별 분류 : 2단 투입, 2단 배출, 리미트, 체커
            if(scale.comparator_mode == CONSTANT['COMP_MODE_INPUT']) {
                scale.s1_title = 'fi';
                scale.s2_title = 'fr';
                scale.s3_title = 'pl';
                scale.s4_title = 'ov';
                scale.s5_title = 'ud';
            }
            else if(scale.comparator_mode == CONSTANT['COMP_MODE_EMISSION']) {
                scale.s1_title = '';
                scale.s2_title = '';
                scale.s3_title = '';
                scale.s4_title = '';
                scale.s5_title = '';
            }
            else if(scale.comparator_mode == CONSTANT['COMP_MODE_LIMIT']) {
                scale.s1_title = '';
                scale.s2_title = '';
                scale.s3_title = '';
                scale.s4_title = '';
                scale.s5_title = '';
            }
            else if(scale.comparator_mode == CONSTANT['COMP_MODE_CHECKER']) {
                scale.s1_title = '';
                scale.s2_title = '';
                scale.s3_title = '';
                scale.s4_title = '';
                scale.s5_title = '';
            }
        }
        // 컴퍼레이터 설정값 읽기
        if(scale.comparator) {
            let value = Number(body).toString();

            if(header == 'RDS1') {
                scale.s1_value = value;
            }
            else if(header == 'RDS2') {
                scale.s2_value = value;
            }
            else if(header == 'RDS3') {
                scale.s3_value = value;
            }
            else if(header == 'RDS4') {
                scale.s4_value = value;
            }
            else if(header == 'RDS5') {
                scale.s5_value = value;

                setTimeout(function(){
                    commandOk();
                }, CONSTANT['ONE_HUNDRED_MS']);
            }
        }

        if(header == 'STOOK') {
            commandRsset();
        }

        if(header == 'SETOK') {
            resultSetok();
        }

        // 버전 확인
        if(header == 'VER') {
            const data = Number(body)/100;
            configWin.webContents.send('get_rom_ver', data);

            return;
        }

        // F펑션
        if(header.substr(0, 1) == 'F') {
            const data = Number(body);
            if(basicConfig.isRead) {
                if(header == 'F001') {
                    basicConfig.digitalFilter = data;
                }

                if(header == 'F002') {
                    basicConfig.holdMode = data;
                }

                if(header == 'F003') {
                    basicConfig.averageTime = data;
                    configWin.webContents.send('get_basic_left_config_data', basicConfig);
                }
            }
            else {
                if(header == 'F003') {
                    configWin.webContents.send('set_basic_left_config_data', 'ok');
                    basicConfig.isRead = false;
                }
            }

            if(externalPrintConfig.isRead){
                if(header == 'F101') {
                    externalPrintConfig.printCondition = data;
                }

                if(header == 'F102') {
                    externalPrintConfig.configValue = data;
                }

                if(header == 'F103') {
                    externalPrintConfig.comparatorMode = data;
                }

                if(header == 'F104') {
                    externalPrintConfig.nearZero = data;
                    configWin.webContents.send('get_external_print_config_data', externalPrintConfig);
                }
            }
            else {
                if(header == 'F104') {
                    configWin.webContents.send('set_external_print_config_data', 'ok');
                    externalPrintConfig.isRead = false;
                }
            }

            if(header == 'F201') {
                log.info('success F201');

                serialConfig.baudrate = pcConfig.baudrate;
                serialConfig.databits = Number(pcConfig.databits);
                serialConfig.parity = pcConfig.parity;
                serialConfig.stopbits = Number(pcConfig.stopbits);
                serialConfig.terminator = pcConfig.terminator == CONSTANT['CRLF'] ? 1 : 2;
                configWin.webContents.send('get_serial_config_data', serialConfig);
            }

            if(header == 'F202') {
                log.info('success F202');
                serialConfig.databits = data;
            }

            if(header == 'F203') {
                log.info('success F203');
                serialConfig.parity = data;
            }

            if(header == 'F204') {
                log.info('success F204');
                serialConfig.stopbits = data;
            }
        }

        // CF펑션
        if(header.substr(0, 2) == 'CF') {
            const data = Number(body);
            if(basicConfig.isRead) {
                // 기본설정(우)
                if(header == 'CF05') {
                    basicConfig.zeroRange = data;
                }

                if(header == 'CF06') {
                    basicConfig.zeroTrackingTime = data;
                }

                if(header == 'CF07') {
                    basicConfig.zeroTrackingWidth = data;
                }

                if(header == 'CF08') {
                    basicConfig.powerOnZero = data;
                    configWin.webContents.send('get_basic_right_config_data', basicConfig);
                }
            }
            else {
                if(header == 'CF08') {
                    configWin.webContents.send('set_basic_right_config_data', 'ok');
                    basicConfig.isRead = false;
                }
            }

            if(calibrationConfig.isRead) {
                // 교정 설정값
                if(header == 'CF03') {
                    calibrationConfig.capa = data;
                }

                if(header == 'CF02') {
                    calibrationConfig.div = data;
                }

                if(header == 'CF01') {
                    calibrationConfig.decimalPoint = data;
                }

                if(header == 'CF09') {
                    calibrationConfig.unit = data;
                    configWin.webContents.send('get_calibration_config_data', calibrationConfig);
                }
                // 교정
                if(header == 'CF04') {
                    calibrationConfig.spanValue = data;
                    configWin.webContents.send('get_cal_data', calibrationConfig);
                }
            }
            else {
                if(header == 'CF09') {
                    configWin.webContents.send('set_calibration_config_data', 'ok');
                    calibrationConfig.isRead = false;
                }
            }
        }
    }

    // 컴퍼레이터 버전정보
    // CALZERO, CALSPAN
    // INCOK, INFOK
    // ?, I
    else if(splitedDataLength == 1) {
        const header = splitedData[0];
        if(header == '?') {
            log.error('COMMAND NOT DEFINE');
        }
        if(header == 'I') {
            log.error('COMMAND NOT RUN');
        }
        if(header.substr(0, 1) == '@') {
            log.info('COMPARATOR VERSION INFO:', header);
        }
        if(header == 'CALZERO') {
            configWin.webContents.send('set_cal_zero', 'ok');
            return;
        }
        if(header == 'CALSPAN') {
            configWin.webContents.send('set_cal_span', 'ok');
            return;
        }
        if(header == 'INFOK' || header == 'INCOK') {
            // 초기화 된 설정값으로 변경 후 재연결
            const currentPort = pcConfig.port;
            pcConfig = new uartFlag(currentPort, 24, 8, CONSTANT['PARITY_NONE'], 1, CONSTANT['CRLF']);
            const localStorage = new Store();

            localStorage.set('pc_config.baudrate', 24);
            localStorage.set('pc_config.databits', 8);
            localStorage.set('pc_config.parity', CONSTANT['PARITY_NONE']);
            localStorage.set('pc_config.stopbits', 1);
            localStorage.set('pc_config.terminator', CONSTANT['CRLF']);
            localStorage.set('pc_config.fontcolor', CONSTANT['FONT_COLOR_BLUE']);

            sp.close(function(err){
                if(err) {
                    log.error('error: INFOK/INCOK');
                    log.error(err);
                    return;
                }
                configWin.webContents.send('init_finish', 'ok');
                startProgram();
            });
            return;
        }
    }
}

const getDecimalPoint = function(value) {
    if(value == '') {
        return;
    }
    let result = '';
    const pointPos = value.indexOf('.');

    if(pointPos > 0) {
        decimalPoint = 7-pointPos
        result = Number(value).toFixed(decimalPoint).toString();
    }
    // 소수점 없음
    else {
        result = Number(value).toString();
    }
    return result;
}

const makeFormat = function(data) {
    let result = '';
    if(data == '' || data == undefined){
        return result;
    }

    const value = data.substr(0,8);
    const unit = data.substr(8,2).trim();

    result = getDecimalPoint(value);

    if(result.substr(0,1).includes('0')) {
        scale.isZero = true;
    }
    else {
        scale.isZero = false;
    }

    scale.unit = unit.length;   // kg
    if(unit.length == 1) {
        if(unit == 'g') {
            scale.unit = 1; // g
        }
        else {
            scale.unit = 3; // t
        }
    }

    return result;
}

const getRomVer = function() {
    log.info('function: getRomVer');
    let command = '?VER' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: ?VER');
            log.error(err);
            return;
        }
    });
}

const setSerialConfig = function(data) {
    log.info('function: setSerialConfig');

    let arg = '';
    if(data.baudrate.length == 2) {
        arg += '0' + data.baudrate;
    }
    else {
        arg += data.baudrate;
    }

    arg = arg + data.databits + data.parity + data.stopbits + data.terminator;

    log.info('command: RSSTO');
    let command = 'RSSTO,' + arg + '\r\n';
    scale.f = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: RSSTO');
            log.error(err);
            serialConfig = new uartFlag();
            configWin.webContents.send('set_serial_config_data', 'fail');
            return;
        }
    })
}

const getSerialConfig = function() {
    log.info('function: getSerialConfig');

    log.info('command: ?F201');
    let command = '?F201' + '\r\n';
    scale.f = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: ?F201');
            log.error(err);
            serialConfig = new uartFlag();
            return;
        }
        log.info('command: ?F202');
        command = '?F202' + '\r\n';
        scale.f = true;
        sp.write(command, function(err){
            if(err) {
                log.error('command: ?F202');
                log.error(err);
                serialConfig = new uartFlag();
                return;
            }
            log.info('command: ?F203');
            command = '?F203' + '\r\n';
            scale.f = true;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: ?F203');
                    log.error(err);
                    serialConfig = new uartFlag();
                    return;
                }
                log.info('command: ?F204');
                command = '?F204' + '\r\n';
                scale.f = true;
                sp.write(command, function(err){
                    if(err) {
                        log.error('command: ?F204');
                        log.error(err);
                        serialConfig = new uartFlag();
                        return;
                    }
                    log.info('command: ?F205');
                    command = '?F205' + '\r\n';
                    scale.f = true;
                    sp.write(command, function(err){
                        if(err) {
                            log.error('command: ?F205');
                            log.error(err);
                            serialConfig = new uartFlag();
                            return;
                        }
                    })
                })
            })
        })
    })
}

const setBasicLeftConfig = function(data) {
    log.info('function: setBasicLeftConfig');

    log.info('command: F001');
    let command = 'F001,' + data.digitalFilter.toString() + '\r\n';
    scale.f = true;
    basicConfig.isRead = false;
    sp.write(command, function(err){
        if(err) {
            log.error('command: F001');
            log.error(err);
            return;
        }

        setTimeout(function(){
            log.info('command: F002');
            command = 'F002,' + data.holdMode.toString() + '\r\n';
            scale.f = true;
            basicConfig.isRead = false;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: F002');
                    log.error(err);
                    return;
                }

                setTimeout(function(){
                    log.info('command: F003');
                    command = 'F003,' + data.averageTime.toString() + '\r\n';
                    scale.f = true;
                    basicConfig.isRead = false;
                    sp.write(command, function(err){
                        if(err) {
                            log.error('command: F003');
                            log.error(err);
                            return;
                        }
                    })
                }, CONSTANT['FIVE_HUNDRED_MS']);
            })
        }, CONSTANT['FIVE_HUNDRED_MS']);
    })
}

const getBasicLeftConfig = function() {
    log.info('function: getBasicLeftConfig');

    log.info('command: ?F001');
    let command = '?F001' + '\r\n';
    scale.f = true;
    basicConfig.isRead = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: ?F001');
            log.error(err);
            return;
        }
        log.info('command: ?F002');
        command = '?F002' + '\r\n';
        scale.f = true;
        basicConfig.isRead = true;
        sp.write(command, function(err){
            if(err) {
                log.error('command: ?F002');
                log.error(err);
                return;
            }
            log.info('command: ?F003');
            command = '?F003' + '\r\n';
            scale.f = true;
            basicConfig.isRead = true;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: ?F003');
                    log.error(err);
                    return;
                }
            })
        })
    })
}

const setBasicRightConfig = function(data) {
    log.info('function: setBasicRightConfig');

    log.info('command: CF05');
    let command = 'CF05,' + data.zeroRange + '\r\n';
    scale.cf = true;
    basicConfig.isRead = false;
    sp.write(command, function(err){
        if(err) {
            log.error('command: CF05');
            log.error(err);
            return;
        }

        setTimeout(function(){
            log.info('command: CF06');
            command = 'CF06,' + data.zeroTrackingTime + '\r\n';
            scale.cf = true;
            basicConfig.isRead = false;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: CF06');
                    log.error(err);
                    return;
                }

                setTimeout(function(){
                    log.info('command: CF07');
                    command = 'CF07,' + data.zeroTrackingWidth + '\r\n';
                    scale.cf = true;
                    basicConfig.isRead = false;
                    sp.write(command, function(err){
                        if(err) {
                            log.error('command: CF07');
                            log.error(err);
                            return;
                        }

                        setTimeout(function(){
                            log.info('command: CF08');
                            command = 'CF08,' + data.powerOnZero + '\r\n';
                            scale.cf = true;
                            basicConfig.isRead = false;
                            sp.write(command, function(err){
                                if(err) {
                                    log.error('command: CF08');
                                    log.error(err);
                                    return;
                                }
                            })
                        }, CONSTANT['FIVE_HUNDRED_MS']);
                    })
                }, CONSTANT['FIVE_HUNDRED_MS']);
            })
        }, CONSTANT['FIVE_HUNDRED_MS']);
    })
}

const getBasicRightConfig = function() {
    log.info('function: getBasicRightConfig');

    log.info('command: ?CF05');
    let command = '?CF05' + '\r\n';
    scale.cf = true;
    basicConfig.isRead = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: ?CF05');
            log.error(err);
            return;
        }
        log.info('command: ?CF06');
        command = '?CF06' + '\r\n';
        scale.cf = true;
        basicConfig.isRead = true;
        sp.write(command, function(err){
            if(err) {
                log.error('command: ?CF06');
                log.error(err);
                return;
            }
            log.info('command: ?CF07');
            command = '?CF07' + '\r\n';
            scale.cf = true;
            basicConfig.isRead = true;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: ?CF07');
                    log.error(err);
                    return;
                }
                log.info('command: ?CF08');
                command = '?CF08' + '\r\n';
                scale.cf = true;
                basicConfig.isRead = true;
                sp.write(command, function(err){
                    if(err) {
                        log.error('command: ?CF08');
                        log.error(err);
                        return;
                    }
                })
            })
        })
    })
}

const setExternalPrintConfig = function(data) {
    log.info('function: setExternalPrintConfig');

    log.info('command: F101');
    let command = 'F101,' + data.printCondition + '\r\n';
    scale.f = true;
    externalPrintConfig.isRead = false;
    sp.write(command, function(err){
        if(err) {
            log.error('command: F101');
            log.error(err);
            return;
        }
        setTimeout(function(){
            log.info('command: F102');
            command = 'F102,' + data.configValue + '\r\n';
            scale.f = true;
            externalPrintConfig.isRead = false;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: F102');
                    log.error(err);
                    return;
                }
                setTimeout(function(){
                    log.info('command: F103');
                    command = 'F103,' + data.comparatorMode + '\r\n';
                    scale.f = true;
                    externalPrintConfig.isRead = false;
                    sp.write(command, function(err){
                        if(err) {
                            log.error('command: F103');
                            log.error(err);
                            return;
                        }
                        setTimeout(function(){
                            log.info('command: F104');
                            command = 'F104,' + data.nearZero + '\r\n';
                            scale.f = true;
                            externalPrintConfig.isRead = false;
                            sp.write(command, function(err){
                                if(err) {
                                    log.error('command: F104');
                                    log.error(err);
                                    return;
                                }
                            })
                        }, CONSTANT['FIVE_HUNDRED_MS'])
                    })
                }, CONSTANT['FIVE_HUNDRED_MS'])
            })
        }, CONSTANT['FIVE_HUNDRED_MS'])
    })
}

const getExternalPrintConfig = function() {
    log.info('function: setCalibrationConfig');

    log.info('command: ?F101');
    let command = '?F101' + '\r\n';
    scale.f = true;
    externalPrintConfig.isRead = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: ?F101');
            log.error(err);
            return;
        }
        log.info('command: ?F102');
        command = '?F102' + '\r\n';
        scale.f = true;
        externalPrintConfig.isRead = true;
        sp.write(command, function(err){
            if(err) {
                log.error('command: ?F102');
                log.error(err);
                return;
            }
            log.info('command: ?F103');
            command = '?F103' + '\r\n';
            scale.f = true;
            externalPrintConfig.isRead = true;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: ?F103');
                    log.error(err);
                    return;
                }
                log.info('command: ?F104');
                command = '?F104' + '\r\n';
                scale.f = true;
                externalPrintConfig.isRead = true;
                sp.write(command, function(err){
                    if(err) {
                        log.error('command: ?F104');
                        log.error(err);
                        return;
                    }
                })
            })
        })
    })
}

const setCalibrationConfig = function(data) {
    log.info('function: setCalibrationConfig');

    log.info('command: CF03');
    let command = 'CF03,' + data.capa + '\r\n';
    scale.cf = true;
    calibrationConfig.isRead = false;
    sp.write(command, function(err){
        if(err) {
            log.error('command: CF03');
            log.error(err);
            return;
        }
        setTimeout(function(){
            log.info('command: CF02');
            command = 'CF02,' + data.div + '\r\n';
            scale.cf = true;
            calibrationConfig.isRead = false;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: CF02');
                    log.error(err);
                    return;
                }
                setTimeout(function(){
                    log.info('command: CF01');
                    command = 'CF01,' + data.decimalPoint + '\r\n';
                    scale.cf = true;
                    calibrationConfig.isRead = false;
                    sp.write(command, function(err){
                        if(err) {
                            log.error('command: CF01');
                            log.error(err);
                            return;
                        }
                        setTimeout(function(){
                            log.info('command: CF09');
                            command = 'CF09,' + data.unit + '\r\n';
                            scale.cf = true;
                            calibrationConfig.isRead = false;
                            sp.write(command, function(err){
                                if(err) {
                                    log.error('command: CF09');
                                    log.error(err);
                                    return;
                                }
                            })
                        }, CONSTANT['FIVE_HUNDRED_MS'])
                    })
                }, CONSTANT['FIVE_HUNDRED_MS'])
            })
        },CONSTANT['FIVE_HUNDRED_MS'])
    })
}

const getCalibrationConfig = function() {
    log.info('function: getCalibrationConfig');

    log.info('command: ?CF03');
    let command = '?CF03' + '\r\n';
    scale.cf = true;
    calibrationConfig.isRead = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: ?CF03');
            log.error(err);
            return;
        }
        log.info('command: ?CF02');
        command = '?CF02' + '\r\n';
        scale.cf = true;
        calibrationConfig.isRead = true;
        sp.write(command, function(err){
            if(err) {
                log.error('command: ?CF02');
                log.error(err);
                return;
            }
            log.info('command: ?CF01');
            command = '?CF01' + '\r\n';
            scale.cf = true;
            calibrationConfig.isRead = true;
            sp.write(command, function(err){
                if(err) {
                    log.error('command: ?CF01');
                    log.error(err);
                    return;
                }

                log.info('command: ?CF09');
                command = '?CF09' + '\r\n';
                scale.cf = true;
                calibrationConfig.isRead = true;
                sp.write(command, function(err){
                    if(err) {
                        log.error('command: ?CF09');
                        log.error(err);
                        return;
                    }
                })
            })
        })
    })
}

const setCalZero = function() {
    log.info('function: setCalZero');
    let command = 'CALZERO' + '\r\n';
    scale.cf = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: CALZERO');
            log.error(err);
            configWin.webContents.send('set_cal_zero', 'fail');
            return;
        }
    });
}

const setCalSpan = function() {
    log.info('function: setCalSpan');
    let command = 'CALSPAN' + '\r\n';
    scale.cf = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: setCalSpan');
            log.error(err);
            configWin.webContents.send('set_cal_span', 'fail');
            return;
        }
    });
}

const setSpanValue = function(data) {
    log.info('function: setSpanValue');
    let command = 'CF04,' + data + '\r\n';
    scale.cf = true;
    calibrationConfig.isRead = false;
    sp.write(command, function(err){
        if(err) {
            log.error('command: setSpanValue');
            log.error(err);
            return;
        }
    })
}

const getCal = function() {
    log.info('function: getCal');
    let command = '?CF04' + '\r\n';
    scale.cf = true;
    calibrationConfig.isRead = true;
    sp.write(command, function(err){
        if(err) {
            log.error('command: getCal');
            log.error(err);
            return;
        }
    })
}

const initFunctionF = function() {
    log.info('function: initFunctionF');
    let command = 'INF' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: initFunctionF');
            log.error(err);
            return;
        }
    });
}

const initConfig = function() {
    log.info('function: initConfig');
    const command = 'INC' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: initconfig');
            log.error(err);
            return;
        }
    });
}

const openPort = function() {
    log.info('function: openPort');
    try {
        let parity = 'none';
        if(pcConfig.parity == CONSTANT['PARITY_ODD']) {
            parity = 'odd';
        }
        else if(pcConfig.parity == CONSTANT['PARITY_EVEN']) {
            parity = 'even';
        }
        sp = new SerialPort(pcConfig.port, {
            baudRate: pcConfig.baudrate * 100,
            dataBits: Number(pcConfig.databits),
            parity: parity,
            stopBits: Number(pcConfig.stopbits)
        });
        log.info('pcConfig');
        log.info(pcConfig);
        return sp;
    }
    catch(e) {
        log.error('error: openPort');
        log.error('Cannot open port.');
        log.error(e);
    }
};

const changeMainButtonActive = function(isActive) {
    log.info('function: changeMainButtonActive');
    win.webContents.send('main_button_active', isActive);
}

let isPause = false;
let timer;

const confirmConnection = function() {
    // log.info('function: confirmConnection');
    if(isPause) {
        return;
    }
    scale.waiting_sec++;
    if(scale.waiting_sec > 1) {
        scale.displayMsg = '-----';
        scale.unit = 0;
        scale.isStable = false;
        scale.isHold = false;
        scale.isZero = false;
        scale.isNet = false;
        scale.isHg = false;
        win.webContents.send('rx_data', scale);
    }
}

const startWaitTimer = function() {
    log.info('function: startWaitTimer');
    isPause = false;
    timer = setInterval(function() {
        confirmConnection();
    }, 500);
}

const stopWaitTimer = function() {
    log.info('function: stopWaitTimer');
    clearInterval(timer);
    isPause = true;
}

ipcMain.on('open_pc_config_window', (event, arg) => {
    log.info('ipcMain.on: open_pc_config_window');
    openPCConfigWindow();
})

ipcMain.on('window_close', (event, arg) => {
    log.info('ipcMain.on: window_close');
    if(arg == 'main') {
        win.close();
    }
    else if(arg == 'config'){
        configWin.close();
    }
    else if(arg == 'pc_config'){
        pcConfigWin.close();
    }
});

ipcMain.on('open_config_window', (event, arg) => {
    log.info('ipcMain.on: open_config_window');
    setCommandMode();
})

ipcMain.on('pc_config_set_data', (event, data) => {
    log.info('ipcMain.on: pc_config_set_data');
    pcConfig = data;

    const localStorage = new Store();

    localStorage.set('pc_config.port', data.port);
    localStorage.set('pc_config.baudrate', data.baudrate);
    localStorage.set('pc_config.databits', data.databits);
    localStorage.set('pc_config.parity', data.parity);
    localStorage.set('pc_config.stopbits', data.stopbits);
    localStorage.set('pc_config.terminator', data.terminator);
    localStorage.set('pc_config.fontcolor', data.fontcolor);

    win.webContents.send('set_font_color', data.fontcolor);
})

ipcMain.on('set_serial_config_data', (event, data) => {
    log.info('ipcMain.on: set_serial_config_data');
    serialConfig = data;
    setSerialConfig(data);
})

ipcMain.on('set_basic_left_config_data', (event, data) => {
    log.info('ipcMain.on: set_basic_left_config_data');
    setBasicLeftConfig(data);
})

ipcMain.on('set_basic_right_config_data', (event, data) => {
    log.info('ipcMain.on: set_basic_right_config_data');
    setBasicRightConfig(data);
})

ipcMain.on('set_external_print_config_data', (event, data) => {
    log.info('ipcMain.on: set_external_print_config_data');
    setExternalPrintConfig(data);
})

ipcMain.on('set_calibration_config_data', (event, data) => {
    log.info('ipcMain.on: set_calibration_config_data');
    setCalibrationConfig(data);
})

ipcMain.on('set_cal_zero', (event, data) => {
    log.info('ipcMain.on: set_cal_zero');
    setCalZero();
})

ipcMain.on('set_cal_span', (event, data) => {
    log.info('ipcMain.on: set_cal_span');
    setCalSpan();
})

ipcMain.on('set_span_value_data', (event, data) => {
    log.info('ipcMain.on: set_span_value_data');
    setSpanValue(data);
})

ipcMain.on('set_stream_mode', (event, data) => {
    log.info('ipcMain.on: set_stream_mode');
    if(sp == undefined) {
        return;
    }
    setStreamMode();
})

ipcMain.on('get_serial_config_data', (event, arg) => {
    log.info('ipcMain.on: get_serial_config_data');
    getSerialConfig();
})

ipcMain.on('get_basic_left_config_data', (event, arg) => {
    log.info('ipcMain.on: get_basic_left_config_data');
    getBasicLeftConfig();
})

ipcMain.on('get_basic_right_config_data', (event, arg) => {
    log.info('ipcMain.on: get_basic_right_config_data');
    getBasicRightConfig();
})

ipcMain.on('get_external_print_config_data', (event, arg) => {
    log.info('ipcMain.on: get_external_print_config_data');
    getExternalPrintConfig();
})

ipcMain.on('get_calibration_config_data', (event, arg) => {
    log.info('ipcMain.on: get_calibration_config_data');
    getCalibrationConfig();
})

ipcMain.on('get_cal_data', (event, arg) => {
    log.info('ipcMain.on: get_cal_data');
    getCal();
});

ipcMain.on('init_function_f', (event, arg) => {
    log.info('ipcMain.on: init_function_f');
    initFunctionF();
})

ipcMain.on('init_config', (event, arg) => {
    log.info('ipcMain.on: init_config');
    initConfig();
})

ipcMain.on('start', (event, arg) =>{
    log.info('ipcMain.on: start');
    start();
})

ipcMain.on('set_clear_tare', (event, arg) =>{
    log.info('ipcMain.on: set_clear_tare');
    setClearTare();
})

ipcMain.on('set_zero_tare', (event, arg) =>{
    log.info('ipcMain.on: set_zero_tare');
    setZeroTare();
})

ipcMain.on('set_gross_net', (event, arg) =>{
    log.info('ipcMain.on: set_gross_net');
    setGrossNet();
})

ipcMain.on('set_hold', (event, arg) =>{
    log.info('ipcMain.on: set_hold');
    setHold();
})

// 2단 투입 시작
const start = function() {
    log.info('function: start');
    const command = 'SW1' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: SW1');
            log.error(err);
            return;
        }
    })
}

const setClearTare = function() {
    log.info('function: setClearTare');
    const command = 'CT' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: cleartare');
            log.error(err);
            return;
        }
    })
}

const setZeroTare = function() {
    log.info('function: setZeroTare');
    const command = 'MZT' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('command: zerotare');
            log.error(err);
            return;
        }
    })
}

const setGrossNet = function() {
    log.info('function: setGrossNet');
    let command = 'MN' + '\r\n';

    if(scale.isNet) {
        command = 'MG' + '\r\n';
    }
    sp.write(command, function(err){
        if(err) {
            log.error('command: grossnet');
            log.error(err);
            return;
        }
    })
}

const setHold = function() {
    log.info('function: setHold');
    let command = 'HS' + '\r\n';

    if(scale.isHold) {
        command = 'HC' + '\r\n';
    }
    sp.write(command, function(err){
        if(err) {
            log.error('command: hold');
            log.error(err);
            return;
        }
    })
}

ipcMain.on('print', (event, arg) => {
    log.info('ipcMain.on: print');
    dialog.showMessageBox({type: 'info', title: '프린트', message: '준비중입니다.'});
    return;
})

ipcMain.on('on_off', (event, arg) => {
    log.info('ipcMain.on: on_off');
    try {
        // 프로그램 시작
        if(arg == 'ON') {
            startWaitTimer();
            pcConfigGetLocalStorage(event);
            startProgram();
        }

        // 프로그램 종료
        else {
            stopWaitTimer();
            stopProgram();
        }
    }
    catch(e) {
        log.error('error: ipcMain.on / on_off');
    }
})

const createSocketServer = function(ls) {
    // TCP/IP 서버 소켓
    socketServer = net.createServer(function(socket) {
        let isConnected = true;

        log.info('client connect');
        socket.write('Welcome to Socket Server');

        // 계량모듈로부터 받는 시리얼 데이터를 클라이언트로 전송하기
        ls.on('data', function(rx) {
            if(isConnected){
                socket.write(rx + '\r\n');
            }
        });

        // 클라이언트에서 보내는 데이터 처리
        socket.on('data', function(chunk) {
            let message = chunk.toString();
            log.info('client send : ', message);
        });

        // 클라이언트와 연결이 해제되었을때
        socket.on('end', function() {
            log.info('client connection end');
            isConnected = false;
        });

        // 연결 에러 있을 때
        socket.on('error', (err) => {
            log.error('Connection error:', err.message);
        });
    })
    .listen(CONSTANT['SERVER_PORT'], function(){
        log.info('listening on 3100...');
    });
}

const startProgram = function() {
    log.info('function: startProgram');
    sp = openPort();

    log.info('command: START');
    // 201208 start 커맨드
    const command = 'START' + '\r\n';
    sp.write(command, function(err){
        if(err) {
            log.error('error: command START');
            log.error(err);
            return;
        }

        const lineStream = sp.pipe(new Readline({ delimiter: pcConfig.terminator == CONSTANT['CRLF'] ? '\r\n' : '\r' }, { encoding: 'utf-8' }));
        lineStream.on('data', function(rx) {
            readHeader(rx);
            win.webContents.send('rx_data', scale);
            scale.waiting_sec = 0;
        });

        createSocketServer(lineStream);
    });

    changeMainButtonActive(true);
}

const stopProgram = function() {
    log.info('function: stopProgram');
    // scale = new scaleFlag();

    if(sp != undefined) {
        sp.close(function(err){
            socketServer.close();
            setStreamMode();

            if(err) {
                log.error('error: serialport close');
                log.error(err);
                return;
            }
        });
    }

    changeMainButtonActive(false);
}

app.whenReady().then(createWindow)
