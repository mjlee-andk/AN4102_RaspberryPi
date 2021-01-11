const WINDOW_WIDTH = 807;
const WINDOW_HEIGHT = 450;

const PARITY_NONE = '0';
const PARITY_ODD = '1';
const PARITY_EVEN = '2';

const CRLF = '1';
const CR = '2';

const RED = '1';
const YELLOW = '2';
const BLUE = '3';

const SERVER_PORT = 3100;

const LOCALSTORAGE_KEY_PORT = 'port';
const LOCALSTORAGE_KEY_BAUDRATE = 'baudrate';
const LOCALSTORAGE_KEY_DATABITS = 'databits';
const LOCALSTORAGE_KEY_PARITY = 'parity';
const LOCALSTORAGE_KEY_STOPBITS = 'stopbits';
const LOCALSTORAGE_KEY_TERMINATOR = 'terminator';

const ONE_HUNDRED_MS = 100;
const FIVE_HUNDRED_MS = 500;

const TAB_SERIAL_CONFIG = 'tab_serial_config';
const TAB_BASIC_LEFT_CONFIG = 'tab_basic_left_config';
const TAB_BASIC_RIGHT_CONFIG = 'tab_basic_right_config';
const TAB_EXTERNAL_PRINT_CONFIG = 'tab_external_print_config';
const TAB_CALIBRATION_CONFIG = 'tab_calibration_config';
const TAB_CALIBRATION = 'tab_calibration';
const TAB_INIT = 'tab_init';

const DEFAULT_SERIAL_PORT_WINDOW = 'COM1';
const DEFAULT_SERIAL_PORT_LINUX = '/dev/tty_AMA0';

const COMP_MODE_INPUT = 1; // 2단 투입
const COMP_MODE_EMISSION = 2; // 2단 배출
const COMP_MODE_LIMIT = 3; // 리미트 모드
const COMP_MODE_CHECKER = 4; // 체커 모드

const HI = 1;
const LO = 2;
const OK = 3;

module.exports = {
    WINDOW_WIDTH,
    WINDOW_HEIGHT,
    PARITY_NONE,
    PARITY_ODD,
    PARITY_EVEN,
    CRLF,
    CR,
    RED,
    YELLOW,
    BLUE,
    LOCALSTORAGE_KEY_PORT,
    LOCALSTORAGE_KEY_BAUDRATE,
    LOCALSTORAGE_KEY_DATABITS,
    LOCALSTORAGE_KEY_PARITY,
    LOCALSTORAGE_KEY_STOPBITS,
    LOCALSTORAGE_KEY_TERMINATOR,
    ONE_HUNDRED_MS,
    FIVE_HUNDRED_MS,
    TAB_SERIAL_CONFIG,
    TAB_BASIC_LEFT_CONFIG,
    TAB_BASIC_RIGHT_CONFIG,
    TAB_EXTERNAL_PRINT_CONFIG,
    TAB_CALIBRATION_CONFIG,
    TAB_CALIBRATION,
    TAB_INIT,
    DEFAULT_SERIAL_PORT_WINDOW,
    DEFAULT_SERIAL_PORT_LINUX,
    SERVER_PORT,
    COMP_MODE_INPUT,
    COMP_MODE_EMISSION,
    COMP_MODE_LIMIT,
    COMP_MODE_CHECKER,
    HI,
    LO,
    OK
}
