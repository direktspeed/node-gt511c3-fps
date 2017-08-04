var SerialPort = require("serialport");
var Promise = require("promise");
var Async = require("async");

class GT511C3 {
  constructor(port, config) {
    if (config != undefined) {
      this.debug = config.debug | false;
      this.baudrate = config.baudrate || 115200;
    } else {
      this.debug = false;
      this.baudrate = 115200;
    }
    PORT = port | '/dev/ttyS1';

    this.port = new SerialPort(PORT, {
      baudrate: this.baudrate
      //baudrate: 57600,
      //baudrate: 38400,
      //baudrate: 19200,
      //baudrate: 9600,
      //debug: true
    });
    this.firmwareVersion = '';
    this.isoAreaMaxSize = 0;
    this.deviceSerialNumber = '';
    this.serialPort;

    this.DEBUG = false, this.BAUDRATE = 9600, this.ACTUAL_BAUDRATE, this.DATA_PACKET_LENGTH, this.BUFFERSIZE = 100000; //serialport buffer size 100kB

    //GT-511C3 device ID
    this.DEVICE_ID = 0x0001;
    //start codes
    this.COMMAND_START_CODE_1 = 0x55, this.COMMAND_START_CODE_2 = 0xAA, this.RESPONSE_START_CODE_1 = 0x55, this.RESPONSE_START_CODE_2 = 0xAA, this.DATA_START_CODE_1 = 0x5A, this.DATA_START_CODE_2 = 0xA5;

    //timeout settings (ms)
    this.SEND_COMMAND_TIMEOUT = 1000, this.SEND_DATA_TIMEOUT = 1000, this.GET_DATA_TIMEOUT = 5000, this.GET_IMAGE_TIMEOUT = 10000, this.INIT_TIMEOUT = 5000;

    //GT-511C3 command list
    this.OPEN = 0x01, this.CLOSE = 0x02, this.USB_INTERNAL_CHECK = 0x03, this.CHANGE_BAUDRATE = 0x04, this.SET_IAP_MODE = 0x05, this.CMOS_LED = 0x12, this.GET_ENROLL_COUNT = 0x20, this.CHECK_ENROLLED = 0x21, this.ENROLL_START = 0x22, this.ENROLL_1 = 0x23, this.ENROLL_2 = 0x24, this.ENROLL_3 = 0x25, this.IS_PRESS_FINGER = 0x26, this.DELETE_ID = 0x40, this.DELETE_ALL = 0x41, this.VERIFY = 0x50, this.IDENTIFY = 0x51, this.VERIFY_TEMPLATE = 0x52, this.IDENTIFY_TEMPLATE = 0x53, this.CAPTURE_FINGER = 0x60, this.MAKE_TEMPLATE = 0x61, this.GET_IMAGE = 0x62, this.GET_RAW_IMAGE = 0x63, this.GET_TEMPLATE = 0x70, this.SET_TEMPLATE = 0x71, this.GET_DATABASE_START = 0x72, this.GET_DATABASE_END = 0x73, this.UPGRADE_FIRMWARE = 0x80, this.UPGRADE_ISO_CD_IMAGE = 0x81, this.ACK = 0x0030, this.NACK = 0x0031;

    //GT-511C3 paramaters
    this.NO_EXTRA_INFO = 0x00, //command OPEN
    this.EXTRA_INFO = 0x01, this.LED_OFF = 0x00, //command CMOS_LED
    this.LED_ON = 0x01, this.NOT_BEST_IMAGE = 0x00, //command CAPTURE_FINGER
    this.BEST_IMAGE = 0x01;

    //GT-511C3 error codes
    this.NACK_TIMEOUT = 0x1001;
    this.NACK_INVALID_BAUDRATE = 0x1002, this.NACK_INVALID_POS = 0x1003, this.NACK_IS_NOT_USED = 0x1004, this.NACK_IS_ALREADY_USED = 0x1005, this.NACK_COMM_ERR = 0x1006, this.NACK_VERIFY_FAILED = 0x1007, this.NACK_IDENTIFY_FAILED = 0x1008, this.NACK_DB_IS_FULL = 0x1009, this.NACK_DB_IS_EMPTY = 0x100A, this.NACK_TURN_ERR = 0x100B, this.NACK_BAD_FINGER = 0x100C, this.NACK_ENROLL_FAILED = 0x100D, this.NACK_IS_NOT_SUPPORTED = 0x100E, this.NACK_DEV_ERR = 0x100F, this.NACK_CAPTURE_CANCELED = 0x1010, this.NACK_INVALID_PARAM = 0x1011, this.NACK_FINGER_IS_NOT_PRESSED = 0x1012;

    //error codes human readable
    this.errors = {
      0x1001: 'capture timeout', //obsolete
      0x1002: 'invalid serial baud rate', //obsolete
      0x1003: 'the specified ID is not between 0-199',
      0x1004: 'the specified ID is not used',
      0x1005: 'the specified ID is already used',
      0x1006: 'communication error',
      0x1007: '1:1 verification failure',
      0x1008: '1:N identification failure',
      0x1009: 'the database is full',
      0x100A: 'the database is empty',
      0x100B: 'invalid order of the enrollment', //obsolete
      0x100C: 'too bad fingerprint',
      0x100D: 'enrollment failure',
      0x100E: 'the specified command is not supported',
      0x100F: 'device error, especially if crypto-chip is trouble',
      0x1010: 'the capturing is canceled', //obsolete
      0x1011: 'invalid parameter',
      0x1012: 'finger is not pressed'
    };
  }

}

GT511C3.prototype.decodeError = function (errorCode) {
  return errors[errorCode];
};

var checkCRC = function (buffer) {
  var sum = 0;
  for (var i = 0; i < buffer.length - 2; i++) sum += buffer[i];
  return (sum & 0xFFFF) == buffer.readUInt16LE(buffer.length - 2);
};

var mainBuff = new Buffer(0);

var parser = function (emitter, buffer) {

  buffer = Buffer.concat([mainBuff, buffer]);

  if (buffer[0] == RESPONSE_START_CODE_1 && buffer[1] == RESPONSE_START_CODE_2 && buffer.length >= 12) {

    //lets take the 12bytes response
    var response = new Buffer(buffer.slice(0, 12));

    //remaining bytes
    buffer = new Buffer(buffer.slice(12));

    var response_packet = {
      parameter: response.readUInt16LE(4),
      ack: response.readUInt16LE(8) == ACK,
      crc: checkCRC(response)
    };

    emitter.emit("response_packet", response_packet);
  }

  if (buffer[0] == DATA_START_CODE_1 && buffer[1] == DATA_START_CODE_2 && buffer.length >= DATA_PACKET_LENGTH) {

    //remove header
    var data = buffer.slice(0, DATA_PACKET_LENGTH);

    var crc = checkCRC(data);

    //remove 2 bytes CRC + header
    data = new Buffer(data.slice(4, data.length - 2));

    //remaining bytes
    buffer = new Buffer(buffer.slice(DATA_PACKET_LENGTH));

    var data_packet = {
      data: data,
      crc: crc
    };

    emitter.emit("data_packet", data_packet);
  }

  mainBuff = new Buffer(buffer);
};

GT511C3.prototype.setPort = function (port, baudrate) {
  this.serialPort = new SerialPort(port, {
    baudrate: baudrate,
    databits: 8,
    stopbits: 1,
    parity: 'none',
    buffersize: BUFFERSIZE,
    parser: parser
  }, false);
};

GT511C3.prototype.openPort = function () {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.serialPort.open(function (err) {
      if (err) reject(err);else resolve();
    });
  });
};

GT511C3.prototype.sendCommand = function (cmd, params) {

  var self = this;
  return new Promise(function (resolve, reject) {

    var buffer = new Buffer(12);

    buffer.writeUInt8(COMMAND_START_CODE_1, 0);
    buffer.writeUInt8(COMMAND_START_CODE_2, 1);
    buffer.writeUInt16LE(DEVICE_ID, 2);
    buffer.writeUInt32LE(params | 0, 4);
    buffer.writeUInt8(cmd, 8);
    buffer.writeUInt8(0, 9);

    var checkSum = 0;
    for (var i = 0; i < 10; i++) {
      checkSum += buffer.readUInt8(i);
    }

    buffer.writeUInt16LE(checkSum, 10);

    var send_command_timeout = setTimeout(function () {
      reject("timeout!");
    }, SEND_COMMAND_TIMEOUT);

    self.serialPort.removeAllListeners('response_packet');
    self.serialPort.on('response_packet', function (response) {
      if (DEBUG) console.log("got a response[" + (response.crc ? 'CRC' : '!CRC') + "][" + (response.ack ? 'ACK' : 'NACK!') + '] params: ' + response.parameter);
      clearTimeout(send_command_timeout);
      if (!response.ack) {
        if (response.parameter < 200) {
          reject('duplicated ID: ' + response.parameter);
        } else {
          //reject(errors[response.parameter]); //string representation of the error code
          reject(response.parameter); //error code
        }
      } else {
        resolve(response.parameter);
      }
    });

    self.serialPort.flush(function (err) {
      if (err) {
        clearTimeout(send_command_timeout);
        reject('send command error flush: ' + err);
      } else {
        self.serialPort.write(buffer, function (err, nbytes) {
          if (err) {
            clearTimeout(send_command_timeout);
            reject('send command error: ' + err);
          } else {
            if (DEBUG) console.log('sending ' + buffer.toString('hex') + ' [' + nbytes + ' bytes]...');
            self.serialPort.drain(function (err) {
              if (err) {
                clearTimeout(send_command_timeout);
                reject('send command drain error: ' + err);
              } else {
                if (DEBUG) console.log('command sent!');
              }
            });
          }
        });
      }
    });
  });
};

GT511C3.prototype.sendData = function (data, len) {

  var self = this;
  return new Promise(function (resolve, reject) {

    var buffer = new Buffer(len + 6);

    buffer.writeUInt8(DATA_START_CODE_1, 0);
    buffer.writeUInt8(DATA_START_CODE_2, 1);
    buffer.writeUInt16LE(DEVICE_ID, 2);

    data = new Buffer(data);
    data.copy(buffer, 4, 0, len);

    var checkSum = 0;
    for (var i = 0; i < len + 4; i++) checkSum += buffer.readUInt8(i);

    buffer.writeUInt16LE(checkSum & 0xFFFF, len + 4);

    var send_data_timeout = setTimeout(function () {
      reject("timeout!");
    }, SEND_DATA_TIMEOUT);

    self.serialPort.removeAllListeners('response_packet');
    self.serialPort.on('response_packet', function (response) {
      if (DEBUG) console.log("got a response[" + (response.crc ? 'CRC' : '!CRC') + "][" + (response.ack ? 'ACK' : 'NACK!') + '] params: ' + response.parameter);
      clearTimeout(send_data_timeout);
      if (!response.ack) {
        //reject(errors[response.parameter]); //string representation of the error code
        reject(response.parameter); //error code
      } else {
        resolve(response.parameter);
      }
    });

    self.serialPort.flush(function (err) {
      if (err) {
        clearTimeout(send_command_timeout);
        reject('sendData command error flush: ' + err);
      } else {
        self.serialPort.write(buffer, function (err, nbytes) {
          if (err) {
            clearTimeout(send_data_timeout);
            reject('sendData command error: ' + err);
          } else {
            if (DEBUG) console.log('sending data [' + nbytes + ' bytes]...');
            self.serialPort.drain(function (err) {
              if (err) {
                clearTimeout(send_data_timeout);
                reject('sendData command drain error: ' + err);
              } else {
                if (DEBUG) console.log('data sent!');
              }
            });
          }
        });
      }
    });
  });
};

GT511C3.prototype.setDefaultListeners = function () {
  this.serialPort.removeAllListeners('error');
  this.serialPort.on('error', function (err) {
    console.log('serialport error: ' + err);
  });

  this.serialPort.removeAllListeners('close');
  this.serialPort.on('close', function (err) {
    if (err) {
      console.log('error while closing: ' + err);
    } else {
      if (DEBUG) console.log('serialport successfully closed!');
    }
  });
};

GT511C3.prototype.init = function () {
  var self = this;
  return new Promise(function (resolve, reject) {

    var funList = [];

    var init_timeout;

    function fun(baudrate, callback) {

      var open = function () {

        this.ACTUAL_BAUDRATE = baudrate;

        init_timeout = setTimeout(function () {
          reject('init timeout');
        }, INIT_TIMEOUT);

        self.setDefaultListeners();

        DATA_PACKET_LENGTH = 30;
        self.serialPort.removeAllListeners('data_packet');
        self.serialPort.on('data_packet', function (response) {
          if (DEBUG) console.log("data[" + (response.crc ? 'CRC' : '!CRC') + "][" + response.data.length + ']:' + response.data);
          if (response.crc) {
            response.data = new Buffer(response.data);
            self.firmwareVersion = response.data.readUInt32LE(0).toString(16);
            self.isoAreaMaxSize = response.data.readUInt32LE(4);
            self.deviceSerialNumber = response.data.slice(8).toString('hex');
          }
          clearTimeout(init_timeout);

          if (BAUDRATE != this.ACTUAL_BAUDRATE) {
            self.changeBaudRate(BAUDRATE).then(function () {
              if (DEBUG) console.log("baudrate set to: " + BAUDRATE);
              resolve();
            }, function (err) {
              reject('init - change baudrate error: ' + err);
            });
          } else {
            resolve();
          }
        });

        return self.open(EXTRA_INFO);
      };

      if (DEBUG) console.log('init GT511-C3 at ' + baudrate + ' baud...');

      self.setPort(PORT, baudrate);
      self.openPort().then(open).then(function () {
        //well done, port open!
      }, function (err) {
        if (DEBUG) console.log("init error: " + err);
        clearTimeout(init_timeout);
        self.closePort().then(callback);
      });
    }

    funList.push(function (callback) {
      fun(9600, callback);
    });
    funList.push(function (callback) {
      fun(115200, callback);
    });
    funList.push(function (callback) {
      fun(57600, callback);
    });
    funList.push(function (callback) {
      fun(38400, callback);
    });
    funList.push(function (callback) {
      fun(19200, callback);
    });

    Async.series(funList, function (done) {
      if (!done) {
        reject('didnt match any baudrate!');
      }
    });
  });
};

GT511C3.prototype.setListener = function (event, callback) {
  this.serialPort.removeAllListeners(event);
  this.serialPort.on(event, callback);
};

GT511C3.prototype.open = function (extra_info) {
  return this.sendCommand(OPEN, extra_info);
};

GT511C3.prototype.close = function () {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.sendCommand(CLOSE).then(function () {
      self.serialPort.close(function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }, function (err) {
      reject(err);
    });
  });
};

GT511C3.prototype.closePort = function () {

  var self = this;
  return new Promise(function (resolve, reject) {
    self.serialPort.close(function (err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

GT511C3.prototype.usbInternalCheck = function () {
  return this.sendCommand(USB_INTERNAL_CHECK);
};

GT511C3.prototype.ledONOFF = function (led_state) {
  return this.sendCommand(CMOS_LED, led_state);
};

function delay_ms(ms) {
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, ms);
  });
}

GT511C3.prototype.changeBaudRate = function (baudrate) {

  var self = this;
  return new Promise(function (resolve, reject) {

    if (this.ACTUAL_BAUDRATE == baudrate) reject('change baudrate error: baudrate already set to ' + this.ACTUAL_BAUDRATE);

    var changeBaudrate = function (br) {
      return self.sendCommand(CHANGE_BAUDRATE, br);
    };
    var closePort = function () {
      return self.closePort();
    };
    var setPort = function () {
      return self.setPort(PORT, baudrate);
    };
    var openPort = function () {
      return self.openPort();
    };

    var wait = function () {
      return new Promise(function (resolve, reject) {
        setTimeout(resolve, 200);
      });
    };

    changeBaudrate(baudrate).then(wait).then(closePort).then(setPort).then(openPort).then(function () {
      this.ACTUAL_BAUDRATE = baudrate;
      resolve();
    }, function (err) {
      reject(err);
    });
  });
};

GT511C3.prototype.getEnrollCount = function () {
  return this.sendCommand(GET_ENROLL_COUNT);
};

GT511C3.prototype.checkEnrolled = function (ID) {
  return this.sendCommand(CHECK_ENROLLED, ID);
};

GT511C3.prototype.enrollStart = function (ID) {
  return this.sendCommand(ENROLL_START, ID);
};

GT511C3.prototype.enroll1 = function () {
  return this.sendCommand(ENROLL_1);
};

GT511C3.prototype.enroll2 = function () {
  return this.sendCommand(ENROLL_2);
};

GT511C3.prototype.enroll3 = function () {
  return this.sendCommand(ENROLL_3);
};

GT511C3.prototype.isPressFinger = function () {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.sendCommand(IS_PRESS_FINGER).then(function (parameter) {
      if (parameter == 0) {
        resolve();
      } else {
        reject('finger is not pressed');
      }
    });
  });
};

GT511C3.prototype.waitFinger = function (timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {

    var wait_finger_timeout = setTimeout(function () {
      reject("wait_finger_timeout!");
      wait_finger_timeout = null;
    }, timeout);

    var checkFinger = function () {
      self.isPressFinger().then(function () {
        resolve();
      }, function (err) {
        if (wait_finger_timeout != null) checkFinger();
      });
    };

    checkFinger();
  });
};

GT511C3.prototype.waitReleaseFinger = function (timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {

    var finger_release_timeout = setTimeout(function () {
      reject("finger_release_timeout!");
      finger_release_timeout = null;
    }, timeout);

    var checkFinger = function () {
      self.isPressFinger().then(function () {
        if (finger_release_timeout != null) checkFinger();
      }, function (err) {
        resolve();
      });
    };

    checkFinger();
  });
};

GT511C3.prototype.enroll = function (ID) {
  var self = this;
  return new Promise(function (resolve, reject) {

    var errorHandler = function (err) {
      reject(err);
    };
    var start = function () {
      return self.enrollStart(ID);
    };
    var capture = function () {
      return self.captureFinger(BEST_IMAGE);
    };
    var waitFinger = function () {
      return self.waitFinger(10000);
    };
    var waitReleaseFinger = function () {
      return self.waitReleaseFinger(10000);
    };
    var enroll_delay = function () {
      return delay_ms(500);
    };
    var blink_delay = function () {
      return delay_ms(100);
    };
    var ledON = function () {
      return self.ledONOFF(1);
    };
    var ledOFF = function () {
      return self.ledONOFF(0);
    };

    ledON().then(waitFinger).then(start).then(capture).then(function () {
      return self.enroll1();
    }).then(ledOFF).then(blink_delay).then(ledON).then(waitReleaseFinger).then(enroll_delay).then(waitFinger).then(capture).then(function () {
      return self.enroll2();
    }).then(ledOFF).then(blink_delay).then(ledON).then(waitReleaseFinger).then(enroll_delay).then(waitFinger).then(capture).then(function () {
      return self.enroll3();
    }).then(ledOFF).then(function () {
      resolve();
    }, function (err) {
      ledOFF();
      reject(err);
    });
  });
};

GT511C3.prototype.deleteID = function (ID) {
  return this.sendCommand(DELETE_ID, ID);
};

GT511C3.prototype.deleteAll = function () {
  return this.sendCommand(DELETE_ALL);
};

GT511C3.prototype.verify = function (ID) {
  return this.sendCommand(VERIFY, ID);
};

GT511C3.prototype.identify = function () {
  return this.sendCommand(IDENTIFY);
};

GT511C3.prototype.verifyTemplate = function (ID, template) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.sendCommand(VERIFY_TEMPLATE, ID).then(function () {
      self.sendData(template, 498).then(function () {
        resolve();
      }, function (err) {
        reject(err);
      });
    }, function (err) {
      reject(err);
    });
  });
};

GT511C3.prototype.identifyTemplate = function (template) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.sendCommand(IDENTIFY_TEMPLATE).then(function () {
      self.sendData(template, 498).then(function (ID) {
        resolve(ID);
      }, function (err) {
        reject(err);
      });
    }, function (err) {
      reject(err);
    });
  });
};

GT511C3.prototype.captureFinger = function (image_type) {
  return this.sendCommand(CAPTURE_FINGER, image_type);
};

GT511C3.prototype.makeTemplate = function () {
  var self = this;
  return new Promise(function (resolve, reject) {

    var makeTemplate_timeout = setTimeout(function () {
      reject("makeTemplate_timeout!");
    }, GET_DATA_TIMEOUT);

    DATA_PACKET_LENGTH = 498 + 6; //498bytes
    self.serialPort.removeAllListeners('data_packet');
    self.serialPort.on('data_packet', function (response) {
      if (DEBUG) console.log("data[" + (response.crc ? 'CRC' : '!CRC') + "][" + response.data.length + ']:' + response.data);
      clearInterval(makeTemplate_timeout);
      resolve(response.data);
    });

    self.sendCommand(MAKE_TEMPLATE).then(function () {
      if (DEBUG) console.log("makeTemplate ACK!");
    }, function (err) {
      clearInterval(makeTemplate_timeout);
      reject(err);
    });
  });
};

GT511C3.prototype.getImage = function () {
  var self = this;
  return new Promise(function (resolve, reject) {

    var getImage_timeout = setTimeout(function () {
      reject("getImage_timeout!");
    }, GET_IMAGE_TIMEOUT);

    //258x202 - 52116bytes (image 256x256) + 4bytes HEADER + 2bytes CRC
    DATA_PACKET_LENGTH = 52116 + 6;
    self.serialPort.removeAllListeners('data_packet');
    self.serialPort.on('data_packet', function (response) {
      if (DEBUG) console.log("data[" + (response.crc ? 'CRC' : '!CRC') + "][" + response.data.length + ']:' + response.data);
      clearInterval(getImage_timeout);
      resolve(response.data);
    });

    self.sendCommand(GET_IMAGE).then(function () {
      if (DEBUG) console.log("getImage ACK!");
    }, function (err) {
      clearInterval(getImage_timeout);
      reject(err);
    });
  });
};

GT511C3.prototype.getRawImage = function () {
  var self = this;
  return new Promise(function (resolve, reject) {

    var getRawImage_timeout = setTimeout(function () {
      reject("getRawImage_timeout!");
    }, GET_IMAGE_TIMEOUT);

    //240*320/4 = 19200 bytes (image 320x240) + 4bytes HEADER + 2bytes CRC
    DATA_PACKET_LENGTH = 19200 + 6;
    self.serialPort.removeAllListeners('data_packet');
    self.serialPort.on('data_packet', function (response) {
      if (DEBUG) console.log("raw[" + (response.crc ? 'CRC' : '!CRC') + "][" + response.data.length + ']:' + response.data);
      clearInterval(getRawImage_timeout);
      resolve(response.data);
    });

    self.sendCommand(GET_RAW_IMAGE).then(function () {
      if (DEBUG) console.log("getRawImage ACK!");
    }, function (err) {
      clearInterval(getRawImage_timeout);
      reject(err);
    });
  });
};

GT511C3.prototype.getTemplate = function (ID) {
  var self = this;
  return new Promise(function (resolve, reject) {

    var getTemplate_timeout = setTimeout(function () {
      reject("getTemplate_timeout!");
    }, GET_DATA_TIMEOUT);

    DATA_PACKET_LENGTH = 498 + 6; //498bytes
    self.serialPort.removeAllListeners('data_packet');
    self.serialPort.on('data_packet', function (response) {
      if (DEBUG) console.log("data[" + (response.crc ? 'CRC' : '!CRC') + "][" + response.data.length + ']:' + response.data);
      clearInterval(getTemplate_timeout);
      resolve(response.data);
    });

    self.sendCommand(GET_TEMPLATE, ID).then(function () {
      if (DEBUG) console.log("getTemplate ACK!");
    }, function (err) {
      clearInterval(getTemplate_timeout);
      reject(err);
    });
  });
};

GT511C3.prototype.setTemplate = function (ID, template) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.sendCommand(SET_TEMPLATE, ID).then(function () {

      self.sendData(template, 498).then(function () {
        resolve();
      }, function (err) {
        reject('send data: ' + err);
      });
    }, function (err) {
      reject('send command: ' + err);
    });
  });
};

module.exports = GT511C3;