var fs          = require('fs');
var path        = require('path');
var npos        = require('npos');
var jimp        = require('jimp');
var pdf         = require('pdfkit');
var request     = require('request');
var express     = require('express');
var router      = express.Router();
var urlencode   = require('urlencode');
var app         = express();
let iconv       = require('iconv-lite');
var moment      = require('moment-timezone');
var rand        = require("random-key");
var exec        = require('child_process').exec;
var getPixels   = require("get-pixels")
var dotenv      = require('dotenv').config()
 
var port        = process.env.PORT || 9902;

var escpos      = require('escpos');
escpos.Console  = require('escpos-console');
escpos.USB      = require('escpos-usb');

const NONE	= 0
const BARCODE	= 1
const QRCODE	= 2

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);

app.use(express.json());
app.use(express.urlencoded({ extended: true}));
app.use(express.static(__dirname + '/public'));

function toNumber (s) {
  return parseInt(s.replace(/\,/g, ''), 10);
}

/////////////////////////////////////////////////////////////////////////
//
// middleware
//
app.use(function (req, res, next) {
    req.timestamp  = moment().unix();
    req.receivedAt = moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
    //console.log(req.receivedAt + ': ', req.method, req.protocol +'://' + req.hostname + req.url);
    return next();
  });

//////////////////////////////////////////////////////////////
//
// Express routing
//
// listener
function checkReceipt(s) {
    console.log(s);
}

function parseReceipt(s, path, hash) {
    exec('/usr/bin/php receipt-parser.php ' + '"' + s + '"', function(err, stdout, stderr) {
        var obj = JSON.parse(stdout);
        console.log(obj);
        escpInsert (obj, path, hash);
    });
}

//////////////////////////////////////////////////////////////////////////////////
// EPSON ESC/P COMMAND

const ESC 	=  27;	// escape code
const RESET 	=  64;
const BOLD 	=  69;
const UNDERLINE =  45;
const ALIGN     =  97;
const POINT     =  77;
const FONTATTR  =  38;
const COLOR     = 114;
const PAPERCUT  =  29;


function escp1(data) {
    const buf = [];
    var idx = 0;

    for(i=0; i<data.length; i++) {
        switch(data[i]) {
        case 27:   
            switch (data[++i]) {
            case 64: 
                //process.stdout.write('<reset>');                  
                break;
            case 69: 
                //process.stdout.write('<bold:' + data[++i] + '>');       // need 1 more     
                i += 1;
                break;
            case 45:
                //process.stdout.write('<underline:' + data[++i] + '>');  // 1/49 on, 0/48 off 
                i += 1;
                break;
            case 97:
                //process.stdout.write('<align:' + data[++i] + '>');      // 0/48 flush left, 1/49 centered, 2/50 flush right, 3/51 fill hustification (flush right and left) 
                i += 1;
                break;
            case 77:
                //process.stdout.write('<point:' + data[++i] + '>');      // 10.5-point, 12-cpi
                i += 1;
                break;
            case 33:
                //process.stdout.write('<font-attr:' + data[++i] + '>');  // 
                i += 1;
                break;
            case 100:
                //process.stdout.write('<lf:' + data[++i] + '>');      // 0 - black, ...
                i += 1;
                break;
            case 105:
                //process.stdout.write('<switch:' + data[++i] + '>');      // 0 - black, ...
                i += 1;
                break;
            case 114:
                //process.stdout.write('<color:' + data[++i] + '>');      // 0 - black, ...
                i += 1;
                break;
            case 29:
                idx = i - 1;
                //process.stdout.write('<paper cut:' + data[++i] + ',' + data[++i] + '>');  
                i += 2;
                break;
            default:
                //process.stdout.write('<unknown:' + data[i] + '>');
                i += 1;
                break;
            }
            break;
        default:
            if(data[i] >= 32) { 
                buf.push(data[i]);
                //process.stdout.write(String.fromCharCode(data[i])); 
            }
            else if(data[i] == 10) {
                buf.push(data[i]);
                //console.log('<lf>');
            }
            else if(data[i] == 13) {
                buf.push(data[i]);
                //console.log('<cr>');
            }
            else if(data[i] == 29) {
                idx = i;
                //console.log('<paper cut:' + data[++i] + ',' + data[++i] + '>');
            }
            else {
                buf.push(data[i]);
                //console.log(data[i]);
            }
        }
   }
   if(idx == 0) idx = data.length - 1;

   checkReceipt(iconv.decode(Buffer.from(buf), 'euc-kr').toUpperCase());

   return  iconv.decode(Buffer.from(buf), 'euc-kr').toUpperCase();

    ////////////////////////////////////////////////////////////////////////////////////
    // not reachable code
    let cut   = Buffer.from([10,10,10,10,10,10,10,10,10,29,86,0,0]);
    let align = Buffer.from([27,92,2,13,10,13]);
    let lfeed = Buffer.from([10]);
    let foot  = Buffer.from('How Many Calories Should You Eat on Average? Stop!!!');

    let text = Buffer.concat([Buffer.from(data).slice(0, idx), align, foot, lfeed, cut]);
    console.log(Buffer.from(text).slice(idx, -1));
    
    return Buffer.from(text).toString('hex');
}

function hexdec(hexString) {
    hexString = (hexString + '').replace(/[^a-f0-9]/gi, '')
    return parseInt(hexString, 16)
}

function hex2bin(hexSource) {
    var bin = '';
    for (var i=0;i<hexSource.length;i=i+2) {
        bin += String.fromCharCode(hexdec(hexSource.substr(i,2)));
    }
    return bin;
}

var promo1 = ""
+ "별다방 1,000호점 청담별다방\n"
+ "==========================================\n"
+ "별다방을 보다 특별하게,\n"
+ "보다 건강하게 즐길 수 있는 스토어\n"
+ ". 프리미업 전용푸드공간\n"
+ ". 로스터리 인테리어 커피 전용바\n"
+ ". 테라스공간, 도심속 정원\n"
+ "\n"
+ "서울 강남구 도산대로 (청담동)\n"
+ "1522-0000\n"
+ "";

var recipe1 = ""
+ "바삭한 해물파전, 오징어 듬뿍 (초보전용)\n"
+ "==========================================\n"
+ "(재료)\n"
+ " - 밀가루 또는 부침가루 1공기, 간장1숟갈,\n" 
+ " - 오징어1마리, 물1공기, 쪽파/부추 조금,\n"
+ " - 식용유 넉넉히\n"
+ "(조리순서)\n"
+ "① 쪽파 또는 부추양은 엄지와 검지로 500원짜리 동전크기!  흐르는 물에 뿌리부분 껍질 하나씩 벗기며 씻어주고 뿌리 끝부분 잘라주세요.  물기를 채반에 걸쳐 빼주세요."
+ "② 물과 밀가루 또는 부침가루 비율은 1:1 입니다^^ 쪽파500원짜리 : 물1공기 : 밀가루1공기\n"
+ "③ 여기에 더도말고 간장 1숟갈, 이것이 황금비율이라고 하죠 ~\n"
+ "④ 부추를 원하는 크기로 잘라주면 되요.  정해진 크긴 없고 긴거 좋으면 길게~ 너무 긴건 싫고 파전하면 살짝 긴게 좋아서 6~7cm 정도 길이로 싹뚝 해주었답니다^^\n"
+ "⑤ 오징어도 1마리도 깨끗이 손질해준 뒤 원하는 크기로 잘라주세요.  총총총 올려진 오징어를 상상하며^^ 전 작게 해주었구요~\n"
+ "⑥ 완성된 반죽에 부추+오징어 섞어 주세요.(순서 3번에 4,5번을 혼합) 팬에 식용유를 두르고 달궈지면 혼합된 반죽을 올려 강불에 나두고 바삭하게 부치면 완성입니다.\n"
+ "https://www.10000recipe.com/recipe/6879050\n"
+ "";

var recipe2 = ""
+ "이런 짜파구리는 없었다, 한우채끝살짜파구리\n"
+ "==========================================\n"
+ "(재료)\n"
+ " - 한우채끝살 200g, 소금약간, 짜파게티 1개\n" 
+ " - 올리브유1숟가락,후추약간,너구리면1개\n"
+ "(조리순서)\n"
+ "① 한우 채끝살을 깍둑썬다\n"
+ "② 깍둑 썬 채끝살에 올리브유, 소금, 후추를 넣고 버무린다.\n"
+ "③ 달군 팬에 기름을 두르고 채끝살을 강불로 빠르게 골고루 굽는다.\n"
+ "④ 끓는 물에 짜파게티와 너구리를 끓인다.\n"
+ "⑤ 물을 약간만 남겨두고 버린 뒤 짜파게티스프 1봉지와 너구리스프 1/2봉지를 넣고 볶는다.\n"
+ "⑥ 라면에 구운 채끝살을 넣어 한 번 볶아 완성한다.\n"
+ "https://www.10000recipe.com/recipe/6914201\n"
+ "";

var cert1 =""
+ "원산지 표시\n"
+ "==========================================\n"
+ ". 쇠고기(호주): 설렁탕, 특설렁탕, 어린이설렁탕, 떡국설렁탕, 소고기국밥, 불고기\n"
+ ". 쇠고기스지(호주): 도가니탕, 도가니수육, 도가니전골\n"
+ ". 소꼬리(호주): 꼬리탕, 꼬리찜\n"
+ ". 육수/쇠고기(호주): 삼계설렁탕\n"
+ ". 육수/닭고기(국내산): 삼계설렁탕\n"
+ ". 배추(국내):,김치/김치전\n"
+ ". 고춧가루(중국): 김치/김치전\n"
+ ". 국내산: 쌀\n"
+ "";

function write2pdf (code, type, text) {
    var doc    = new pdf({
        size: [224, 600],
        margins : { // by default, all are 72
            top: 10,
           bottom:10,
            left: 10,
          right: 10
        }
    });
    var filename = path.join(__dirname, 'public/pdf/') + code + '.pdf';
    var out = fs.createWriteStream(filename);
    doc.pipe(out);
    doc
      .font('fonts/NanumGothicCoding.ttf')
      .fontSize(9)
      .text(text, 15, 15);
    doc.end();
    out.on('finish', function() {
      console.log(filename);
    });
}

function barcode(printer, code, type, opts) {
  printer
  .encode('CP860')
  .align('ct')
  .barcode(code, type, opts)
  .text('');
}

function qrcode (printer, text, opts, callback) {
  printer
  .encode('CP860')
  .align('ct')
  .qrimage(text, opts, function(err) {
    this.text('');
    return callback(err);
  });
}

async function resize(url, h) {
  const image = await jimp.read(url);
  await image.resize(jimp.AUTO, h);
  await image.writeAsync(url);
}

function image (printer, url, mode, callback) {
  var image = new jimp(url, function (err, img) {
    var w = img.bitmap.width;  //  width of the image
    var h = img.bitmap.height; // height of the image
    resize (url, 64);
  });
  escpos.Image.load(url, function(img) {
    printer
    .image(img, mode)
    .then(() => { 
      callback(img);
    });
  });
}

function footer (printer, text) {
  if(text.search("별다방")>=0)          printer.text(promo1)
  else if(text.search("철산설렁탕")>=0) printer.text(cert1)
  else if(text.search("대파")>=0)       printer.text(recipe1)
  else if(text.search("부침가루")>=0)   printer.text(recipe1)
  else if(text.search("짜파게티")>=0)   printer.text(recipe2)
  else if(text.search("너구리")>=0)     printer.text(recipe2)
  else if(text.search("채끝")>=0)       printer.text(recipe2)
}

app.post('/', function(req, res) {
    var device  = new escpos.Console();
    var printer = escpos.Printer(device);

    var code = parseInt('88' + rand.generateDigits(10));
    var text = escp1(Buffer.from(req.body.Data, 'hex'));

    /////////////////////////////////////////////////////////////
    console.log('http://debian.tric.kr:9902/pdf/' + code + '.pdf');

    if(0) {
        write2pdf (code, BARCODE, text);
        res.send(req.body.Data);
        return;
    }


    device.open(err => {
      printer
      .hardware('init')
      .align('lt') // ct lt rt
      .encode('EUC-KR') // utf8 | cp860
      .text(text)

      footer(printer, text);

      write2pdf (code, BARCODE, escp1(Buffer.from(printer.buffer._buffer, 'hex')));

      qrcode(printer, 'http://debian.tric.kr:9902/pdf/' + code + '.pdf', {type:'png', margin:4, size:6}, function(err) {
        printer.cut();
        res.send(Buffer.from(printer.buffer._buffer).toString('hex'));
      });

      //.table(["One", "Two", "Three"])
      //image (printer, path.join(__dirname, 'star.png'), 's8', function() { // s|d, 8|24, dw|dh|dwdh
      //  barcode(printer, '880111769400', 'EAN13', {width:3}) // UPC-A UPC-E EAN13 EAN8 CODE39 ITF NW7
      //  qrcode(printer, 'hello world', {type:'png', margin:4, size:8}, function(err) {
      //    printer.cut(); 
      //    res.send(Buffer.from(printer.buffer._buffer).toString('hex'));
      //  });
      //});
    });
});  

app.get('/pdf/:filename', function(req, res){
  var filename = req.params.filename;
  res.render('receipt', {filename: filename});
})

////////////////////////////////////////////////////////
// listener
app.listen(port, function(){
    console.log('Listener: ', 'Example app listening on port ' + port);
});

module.exports = app;
