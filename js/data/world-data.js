/* =========================================================
   Travel Intelligence Center
   World Guide Data V4.0.0

   File Path:
   js/data/world-data.js

   Purpose:
   - Complete 195-country catalog for Guide Intelligence.
   - Provides normalized country identities and baseline guide data.
   - Adds curated overrides for key travel destinations.
   - Uses one compact factory instead of thousands of repeated lines.
   - Designed for GuideEngine V4.0.0 and TravelAI V4.0.0.

   Important:
   - This is an offline planning knowledge base, not a live booking feed.
   - Visa rules, weather, hotel availability and prices must be refreshed
     from trusted live sources before booking.
   ========================================================= */

(function worldGuideDataModule(global) {
  "use strict";

  const VERSION = "4.0.0";

  const COUNTRY_SEEDS = Object.freeze([{"code":"AF","flag":"🇦🇫","nameAr":"أفغانستان","nameEn":"Afghanistan","continent":"Asia","capital":"Kabul","currency":"AFN","languages":["ps","uz","tk"]},{"code":"AL","flag":"🇦🇱","nameAr":"ألبانيا","nameEn":"Albania","continent":"Europe","capital":"Tirana","currency":"ALL","languages":["sq"]},{"code":"DZ","flag":"🇩🇿","nameAr":"الجزائر","nameEn":"Algeria","continent":"Africa","capital":"Algiers","currency":"DZD","languages":["ar"]},{"code":"AD","flag":"🇦🇩","nameAr":"أندورا","nameEn":"Andorra","continent":"Europe","capital":"","currency":"","languages":[]},{"code":"AO","flag":"🇦🇴","nameAr":"أنغولا","nameEn":"Angola","continent":"Africa","capital":"Luanda","currency":"AOA","languages":["pt"]},{"code":"AG","flag":"🇦🇬","nameAr":"أنتيغوا وبربودا","nameEn":"Antigua and Barbuda","continent":"North America","capital":"Saint John's","currency":"XCD","languages":["en"]},{"code":"AR","flag":"🇦🇷","nameAr":"الأرجنتين","nameEn":"Argentina","continent":"South America","capital":"Buenos Aires","currency":"ARS","languages":["es","gn"]},{"code":"AM","flag":"🇦🇲","nameAr":"أرمينيا","nameEn":"Armenia","continent":"Asia","capital":"Yerevan","currency":"AMD","languages":["hy","ru"]},{"code":"AU","flag":"🇦🇺","nameAr":"أستراليا","nameEn":"Australia","continent":"Oceania","capital":"Canberra","currency":"AUD","languages":["en"]},{"code":"AT","flag":"🇦🇹","nameAr":"النمسا","nameEn":"Austria","continent":"Europe","capital":"Vienna","currency":"EUR","languages":["de"]},{"code":"AZ","flag":"🇦🇿","nameAr":"أذربيجان","nameEn":"Azerbaijan","continent":"Asia","capital":"Baku","currency":"AZN","languages":["az","hy"]},{"code":"BS","flag":"🇧🇸","nameAr":"جزر البهاما","nameEn":"Bahamas","continent":"North America","capital":"","currency":"","languages":[]},{"code":"BH","flag":"🇧🇭","nameAr":"البحرين","nameEn":"Bahrain","continent":"Asia","capital":"Manama","currency":"BHD","languages":["ar"]},{"code":"BD","flag":"🇧🇩","nameAr":"بنغلاديش","nameEn":"Bangladesh","continent":"Asia","capital":"Dhaka","currency":"BDT","languages":["bn"]},{"code":"BB","flag":"🇧🇧","nameAr":"بربادوس","nameEn":"Barbados","continent":"North America","capital":"Bridgetown","currency":"BBD","languages":["en"]},{"code":"BY","flag":"🇧🇾","nameAr":"بيلاروس","nameEn":"Belarus","continent":"Europe","capital":"Minsk","currency":"BYR","languages":["be","ru"]},{"code":"BE","flag":"🇧🇪","nameAr":"بلجيكا","nameEn":"Belgium","continent":"Europe","capital":"Brussels","currency":"EUR","languages":["nl","fr","de"]},{"code":"BZ","flag":"🇧🇿","nameAr":"بليز","nameEn":"Belize","continent":"North America","capital":"Belmopan","currency":"BZD","languages":["en","es"]},{"code":"BJ","flag":"🇧🇯","nameAr":"بنين","nameEn":"Benin","continent":"Africa","capital":"Porto-Novo","currency":"XOF","languages":["fr"]},{"code":"BT","flag":"🇧🇹","nameAr":"بوتان","nameEn":"Bhutan","continent":"Asia","capital":"Thimphu","currency":"BTN","languages":["dz"]},{"code":"BO","flag":"🇧🇴","nameAr":"بوليفيا","nameEn":"Bolivia","continent":"South America","capital":"Sucre","currency":"BOB","languages":["es","ay","qu"]},{"code":"BA","flag":"🇧🇦","nameAr":"البوسنة والهرسك","nameEn":"Bosnia and Herzegovina","continent":"Europe","capital":"Sarajevo","currency":"BAM","languages":["bs","hr","sr"]},{"code":"BW","flag":"🇧🇼","nameAr":"بوتسوانا","nameEn":"Botswana","continent":"Africa","capital":"Gaborone","currency":"BWP","languages":["en","tn"]},{"code":"BR","flag":"🇧🇷","nameAr":"البرازيل","nameEn":"Brazil","continent":"South America","capital":"Brasília","currency":"BRL","languages":["pt"]},{"code":"BN","flag":"🇧🇳","nameAr":"بروناي","nameEn":"Brunei","continent":"Asia","capital":"Bandar Seri Begawan","currency":"BND","languages":["ms"]},{"code":"BG","flag":"🇧🇬","nameAr":"بلغاريا","nameEn":"Bulgaria","continent":"Europe","capital":"Sofia","currency":"BGN","languages":["bg"]},{"code":"BF","flag":"🇧🇫","nameAr":"بوركينا فاسو","nameEn":"Burkina Faso","continent":"Africa","capital":"Ouagadougou","currency":"XOF","languages":["fr","ff"]},{"code":"BI","flag":"🇧🇮","nameAr":"بوروندي","nameEn":"Burundi","continent":"Africa","capital":"Bujumbura","currency":"BIF","languages":["fr","rn"]},{"code":"CV","flag":"🇨🇻","nameAr":"الرأس الأخضر","nameEn":"Cabo Verde","continent":"Africa","capital":"","currency":"","languages":[]},{"code":"KH","flag":"🇰🇭","nameAr":"كمبوديا","nameEn":"Cambodia","continent":"Asia","capital":"Phnom Penh","currency":"KHR","languages":["km"]},{"code":"CM","flag":"🇨🇲","nameAr":"الكاميرون","nameEn":"Cameroon","continent":"Africa","capital":"Yaoundé","currency":"XAF","languages":["en","fr"]},{"code":"CA","flag":"🇨🇦","nameAr":"كندا","nameEn":"Canada","continent":"North America","capital":"Ottawa","currency":"CAD","languages":["en","fr"]},{"code":"CF","flag":"🇨🇫","nameAr":"جمهورية أفريقيا الوسطى","nameEn":"Central African Republic","continent":"Africa","capital":"Bangui","currency":"XAF","languages":["fr","sg"]},{"code":"TD","flag":"🇹🇩","nameAr":"تشاد","nameEn":"Chad","continent":"Africa","capital":"N'Djamena","currency":"XAF","languages":["fr","ar"]},{"code":"CL","flag":"🇨🇱","nameAr":"تشيلي","nameEn":"Chile","continent":"South America","capital":"Santiago","currency":"CLF","languages":["es"]},{"code":"CN","flag":"🇨🇳","nameAr":"الصين","nameEn":"China","continent":"Asia","capital":"Beijing","currency":"CNY","languages":["zh"]},{"code":"CO","flag":"🇨🇴","nameAr":"كولومبيا","nameEn":"Colombia","continent":"South America","capital":"Bogotá","currency":"COP","languages":["es"]},{"code":"KM","flag":"🇰🇲","nameAr":"جزر القمر","nameEn":"Comoros","continent":"Africa","capital":"Moroni","currency":"KMF","languages":["ar","fr"]},{"code":"CG","flag":"🇨🇬","nameAr":"جمهورية الكونغو","nameEn":"Republic of the Congo","continent":"Africa","capital":"Brazzaville","currency":"XAF","languages":["fr","ln"]},{"code":"CD","flag":"🇨🇩","nameAr":"جمهورية الكونغو الديمقراطية","nameEn":"Democratic Republic of the Congo","continent":"Africa","capital":"Kinshasa","currency":"CDF","languages":["fr","ln","kg","sw"]},{"code":"CR","flag":"🇨🇷","nameAr":"كوستاريكا","nameEn":"Costa Rica","continent":"North America","capital":"San José","currency":"CRC","languages":["es"]},{"code":"CI","flag":"🇨🇮","nameAr":"ساحل العاج","nameEn":"Côte d’Ivoire","continent":"Africa","capital":"","currency":"","languages":[]},{"code":"HR","flag":"🇭🇷","nameAr":"كرواتيا","nameEn":"Croatia","continent":"Europe","capital":"Zagreb","currency":"HRK","languages":["hr"]},{"code":"CU","flag":"🇨🇺","nameAr":"كوبا","nameEn":"Cuba","continent":"North America","capital":"Havana","currency":"CUC","languages":["es"]},{"code":"CY","flag":"🇨🇾","nameAr":"قبرص","nameEn":"Cyprus","continent":"Asia","capital":"Nicosia","currency":"EUR","languages":["el","tr","hy"]},{"code":"CZ","flag":"🇨🇿","nameAr":"التشيك","nameEn":"Czechia","continent":"Europe","capital":"","currency":"","languages":[]},{"code":"DK","flag":"🇩🇰","nameAr":"الدانمرك","nameEn":"Denmark","continent":"Europe","capital":"Copenhagen","currency":"DKK","languages":["da"]},{"code":"DJ","flag":"🇩🇯","nameAr":"جيبوتي","nameEn":"Djibouti","continent":"Africa","capital":"Djibouti","currency":"DJF","languages":["fr","ar"]},{"code":"DM","flag":"🇩🇲","nameAr":"دومينيكا","nameEn":"Dominica","continent":"North America","capital":"Roseau","currency":"XCD","languages":["en"]},{"code":"DO","flag":"🇩🇴","nameAr":"جمهورية الدومينيكان","nameEn":"Dominican Republic","continent":"North America","capital":"Santo Domingo","currency":"DOP","languages":["es"]},{"code":"EC","flag":"🇪🇨","nameAr":"الإكوادور","nameEn":"Ecuador","continent":"South America","capital":"Quito","currency":"USD","languages":["es"]},{"code":"EG","flag":"🇪🇬","nameAr":"مصر","nameEn":"Egypt","continent":"Africa","capital":"Cairo","currency":"EGP","languages":["ar"]},{"code":"SV","flag":"🇸🇻","nameAr":"السلفادور","nameEn":"El Salvador","continent":"North America","capital":"San Salvador","currency":"SVC","languages":["es"]},{"code":"GQ","flag":"🇬🇶","nameAr":"غينيا الاستوائية","nameEn":"Equatorial Guinea","continent":"Africa","capital":"Malabo","currency":"XAF","languages":["es","fr"]},{"code":"ER","flag":"🇪🇷","nameAr":"إريتريا","nameEn":"Eritrea","continent":"Africa","capital":"Asmara","currency":"ERN","languages":["ti","ar","en"]},{"code":"EE","flag":"🇪🇪","nameAr":"إستونيا","nameEn":"Estonia","continent":"Europe","capital":"Tallinn","currency":"EUR","languages":["et"]},{"code":"SZ","flag":"🇸🇿","nameAr":"إسواتيني","nameEn":"Eswatini","continent":"Africa","capital":"","currency":"","languages":[]},{"code":"ET","flag":"🇪🇹","nameAr":"إثيوبيا","nameEn":"Ethiopia","continent":"Africa","capital":"Addis Ababa","currency":"ETB","languages":["am"]},{"code":"FJ","flag":"🇫🇯","nameAr":"فيجي","nameEn":"Fiji","continent":"Oceania","capital":"Suva","currency":"FJD","languages":["en","fj","hi","ur"]},{"code":"FI","flag":"🇫🇮","nameAr":"فنلندا","nameEn":"Finland","continent":"Europe","capital":"Helsinki","currency":"EUR","languages":["fi","sv"]},{"code":"FR","flag":"🇫🇷","nameAr":"فرنسا","nameEn":"France","continent":"Europe","capital":"Paris","currency":"EUR","languages":["fr"]},{"code":"GA","flag":"🇬🇦","nameAr":"الغابون","nameEn":"Gabon","continent":"Africa","capital":"Libreville","currency":"XAF","languages":["fr"]},{"code":"GM","flag":"🇬🇲","nameAr":"غامبيا","nameEn":"Gambia","continent":"Africa","capital":"","currency":"","languages":[]},{"code":"GE","flag":"🇬🇪","nameAr":"جورجيا","nameEn":"Georgia","continent":"Asia","capital":"Tbilisi","currency":"GEL","languages":["ka"]},{"code":"DE","flag":"🇩🇪","nameAr":"ألمانيا","nameEn":"Germany","continent":"Europe","capital":"Berlin","currency":"EUR","languages":["de"]},{"code":"GH","flag":"🇬🇭","nameAr":"غانا","nameEn":"Ghana","continent":"Africa","capital":"Accra","currency":"GHS","languages":["en"]},{"code":"GR","flag":"🇬🇷","nameAr":"اليونان","nameEn":"Greece","continent":"Europe","capital":"Athens","currency":"EUR","languages":["el"]},{"code":"GD","flag":"🇬🇩","nameAr":"غرينادا","nameEn":"Grenada","continent":"North America","capital":"St. George's","currency":"XCD","languages":["en"]},{"code":"GT","flag":"🇬🇹","nameAr":"غواتيمالا","nameEn":"Guatemala","continent":"North America","capital":"Guatemala City","currency":"GTQ","languages":["es"]},{"code":"GN","flag":"🇬🇳","nameAr":"غينيا","nameEn":"Guinea","continent":"Africa","capital":"Conakry","currency":"GNF","languages":["fr","ff"]},{"code":"GW","flag":"🇬🇼","nameAr":"غينيا بيساو","nameEn":"Guinea-Bissau","continent":"Africa","capital":"Bissau","currency":"XOF","languages":["pt"]},{"code":"GY","flag":"🇬🇾","nameAr":"غيانا","nameEn":"Guyana","continent":"South America","capital":"Georgetown","currency":"GYD","languages":["en"]},{"code":"HT","flag":"🇭🇹","nameAr":"هايتي","nameEn":"Haiti","continent":"North America","capital":"Port-au-Prince","currency":"HTG","languages":["fr","ht"]},{"code":"HN","flag":"🇭🇳","nameAr":"هندوراس","nameEn":"Honduras","continent":"North America","capital":"Tegucigalpa","currency":"HNL","languages":["es"]},{"code":"HU","flag":"🇭🇺","nameAr":"هنغاريا","nameEn":"Hungary","continent":"Europe","capital":"Budapest","currency":"HUF","languages":["hu"]},{"code":"IS","flag":"🇮🇸","nameAr":"آيسلندا","nameEn":"Iceland","continent":"Europe","capital":"Reykjavik","currency":"ISK","languages":["is"]},{"code":"IN","flag":"🇮🇳","nameAr":"الهند","nameEn":"India","continent":"Asia","capital":"New Delhi","currency":"INR","languages":["hi","en"]},{"code":"ID","flag":"🇮🇩","nameAr":"إندونيسيا","nameEn":"Indonesia","continent":"Asia","capital":"Jakarta","currency":"IDR","languages":["id"]},{"code":"IR","flag":"🇮🇷","nameAr":"إيران","nameEn":"Iran","continent":"Asia","capital":"Tehran","currency":"IRR","languages":["fa"]},{"code":"IQ","flag":"🇮🇶","nameAr":"العراق","nameEn":"Iraq","continent":"Asia","capital":"Baghdad","currency":"IQD","languages":["ar","ku"]},{"code":"IE","flag":"🇮🇪","nameAr":"أيرلندا","nameEn":"Ireland","continent":"Europe","capital":"Dublin","currency":"EUR","languages":["ga","en"]},{"code":"IL","flag":"🇮🇱","nameAr":"إسرائيل","nameEn":"Israel","continent":"Asia","capital":"Jerusalem","currency":"ILS","languages":["he","ar"]},{"code":"IT","flag":"🇮🇹","nameAr":"إيطاليا","nameEn":"Italy","continent":"Europe","capital":"Rome","currency":"EUR","languages":["it"]},{"code":"JM","flag":"🇯🇲","nameAr":"جامايكا","nameEn":"Jamaica","continent":"North America","capital":"Kingston","currency":"JMD","languages":["en"]},{"code":"JP","flag":"🇯🇵","nameAr":"اليابان","nameEn":"Japan","continent":"Asia","capital":"Tokyo","currency":"JPY","languages":["ja"]},{"code":"JO","flag":"🇯🇴","nameAr":"الأردن","nameEn":"Jordan","continent":"Asia","capital":"Amman","currency":"JOD","languages":["ar"]},{"code":"KZ","flag":"🇰🇿","nameAr":"كازاخستان","nameEn":"Kazakhstan","continent":"Asia","capital":"Astana","currency":"KZT","languages":["kk","ru"]},{"code":"KE","flag":"🇰🇪","nameAr":"كينيا","nameEn":"Kenya","continent":"Africa","capital":"Nairobi","currency":"KES","languages":["en","sw"]},{"code":"KI","flag":"🇰🇮","nameAr":"كيريباتي","nameEn":"Kiribati","continent":"Oceania","capital":"South Tarawa","currency":"AUD","languages":["en"]},{"code":"KP","flag":"🇰🇵","nameAr":"كوريا الشمالية","nameEn":"North Korea","continent":"Asia","capital":"Pyongyang","currency":"KPW","languages":["ko"]},{"code":"KR","flag":"🇰🇷","nameAr":"كوريا الجنوبية","nameEn":"South Korea","continent":"Asia","capital":"Seoul","currency":"KRW","languages":["ko"]},{"code":"KW","flag":"🇰🇼","nameAr":"الكويت","nameEn":"Kuwait","continent":"Asia","capital":"Kuwait City","currency":"KWD","languages":["ar"]},{"code":"KG","flag":"🇰🇬","nameAr":"قيرغيزستان","nameEn":"Kyrgyzstan","continent":"Asia","capital":"Bishkek","currency":"KGS","languages":["ky","ru"]},{"code":"LA","flag":"🇱🇦","nameAr":"لاوس","nameEn":"Laos","continent":"Asia","capital":"Vientiane","currency":"LAK","languages":["lo"]},{"code":"LV","flag":"🇱🇻","nameAr":"لاتفيا","nameEn":"Latvia","continent":"Europe","capital":"Riga","currency":"EUR","languages":["lv"]},{"code":"LB","flag":"🇱🇧","nameAr":"لبنان","nameEn":"Lebanon","continent":"Asia","capital":"Beirut","currency":"LBP","languages":["ar","fr"]},{"code":"LS","flag":"🇱🇸","nameAr":"ليسوتو","nameEn":"Lesotho","continent":"Africa","capital":"Maseru","currency":"LSL","languages":["en","st"]},{"code":"LR","flag":"🇱🇷","nameAr":"ليبيريا","nameEn":"Liberia","continent":"Africa","capital":"Monrovia","currency":"LRD","languages":["en"]},{"code":"LY","flag":"🇱🇾","nameAr":"ليبيا","nameEn":"Libya","continent":"Africa","capital":"Tripoli","currency":"LYD","languages":["ar"]},{"code":"LI","flag":"🇱🇮","nameAr":"ليختنشتاين","nameEn":"Liechtenstein","continent":"Europe","capital":"Vaduz","currency":"CHF","languages":["de"]},{"code":"LT","flag":"🇱🇹","nameAr":"ليتوانيا","nameEn":"Lithuania","continent":"Europe","capital":"Vilnius","currency":"EUR","languages":["lt"]},{"code":"LU","flag":"🇱🇺","nameAr":"لوكسمبورغ","nameEn":"Luxembourg","continent":"Europe","capital":"Luxembourg","currency":"EUR","languages":["fr","de","lb"]},{"code":"MG","flag":"🇲🇬","nameAr":"مدغشقر","nameEn":"Madagascar","continent":"Africa","capital":"Antananarivo","currency":"MGA","languages":["fr","mg"]},{"code":"MW","flag":"🇲🇼","nameAr":"ملاوي","nameEn":"Malawi","continent":"Africa","capital":"Lilongwe","currency":"MWK","languages":["en","ny"]},{"code":"MY","flag":"🇲🇾","nameAr":"ماليزيا","nameEn":"Malaysia","continent":"Asia","capital":"Kuala Lumpur","currency":"MYR","languages":[]},{"code":"MV","flag":"🇲🇻","nameAr":"جزر المالديف","nameEn":"Maldives","continent":"Asia","capital":"Malé","currency":"MVR","languages":["dv"]},{"code":"ML","flag":"🇲🇱","nameAr":"مالي","nameEn":"Mali","continent":"Africa","capital":"Bamako","currency":"XOF","languages":["fr"]},{"code":"MT","flag":"🇲🇹","nameAr":"مالطا","nameEn":"Malta","continent":"Europe","capital":"Valletta","currency":"EUR","languages":["mt","en"]},{"code":"MH","flag":"🇲🇭","nameAr":"جزر مارشال","nameEn":"Marshall Islands","continent":"Oceania","capital":"Majuro","currency":"USD","languages":["en","mh"]},{"code":"MR","flag":"🇲🇷","nameAr":"موريتانيا","nameEn":"Mauritania","continent":"Africa","capital":"Nouakchott","currency":"MRO","languages":["ar"]},{"code":"MU","flag":"🇲🇺","nameAr":"موريشيوس","nameEn":"Mauritius","continent":"Africa","capital":"Port Louis","currency":"MUR","languages":["en"]},{"code":"MX","flag":"🇲🇽","nameAr":"المكسيك","nameEn":"Mexico","continent":"North America","capital":"Mexico City","currency":"MXN","languages":["es"]},{"code":"FM","flag":"🇫🇲","nameAr":"ميكرونيزيا","nameEn":"Micronesia, Federated States of","continent":"Oceania","capital":"","currency":"","languages":[]},{"code":"MD","flag":"🇲🇩","nameAr":"مولدوفا","nameEn":"Moldova","continent":"Europe","capital":"Chișinău","currency":"MDL","languages":["ro"]},{"code":"MC","flag":"🇲🇨","nameAr":"موناكو","nameEn":"Monaco","continent":"Europe","capital":"Monaco","currency":"EUR","languages":["fr"]},{"code":"MN","flag":"🇲🇳","nameAr":"منغوليا","nameEn":"Mongolia","continent":"Asia","capital":"Ulan Bator","currency":"MNT","languages":["mn"]},{"code":"ME","flag":"🇲🇪","nameAr":"الجبل الأسود","nameEn":"Montenegro","continent":"Europe","capital":"","currency":"","languages":[]},{"code":"MA","flag":"🇲🇦","nameAr":"المغرب","nameEn":"Morocco","continent":"Africa","capital":"Rabat","currency":"MAD","languages":["ar"]},{"code":"MZ","flag":"🇲🇿","nameAr":"موزمبيق","nameEn":"Mozambique","continent":"Africa","capital":"Maputo","currency":"MZN","languages":["pt"]},{"code":"MM","flag":"🇲🇲","nameAr":"ميانمار (بورما)","nameEn":"Myanmar","continent":"Asia","capital":"","currency":"","languages":[]},{"code":"NA","flag":"🇳🇦","nameAr":"ناميبيا","nameEn":"Namibia","continent":"Africa","capital":"Windhoek","currency":"NAD","languages":["en","af"]},{"code":"NR","flag":"🇳🇷","nameAr":"ناورو","nameEn":"Nauru","continent":"Oceania","capital":"Yaren","currency":"AUD","languages":["en","na"]},{"code":"NP","flag":"🇳🇵","nameAr":"نيبال","nameEn":"Nepal","continent":"Asia","capital":"Kathmandu","currency":"NPR","languages":["ne"]},{"code":"NL","flag":"🇳🇱","nameAr":"هولندا","nameEn":"Netherlands","continent":"Europe","capital":"Amsterdam","currency":"EUR","languages":["nl"]},{"code":"NZ","flag":"🇳🇿","nameAr":"نيوزيلندا","nameEn":"New Zealand","continent":"Oceania","capital":"Wellington","currency":"NZD","languages":["en","mi"]},{"code":"NI","flag":"🇳🇮","nameAr":"نيكاراغوا","nameEn":"Nicaragua","continent":"North America","capital":"Managua","currency":"NIO","languages":["es"]},{"code":"NE","flag":"🇳🇪","nameAr":"النيجر","nameEn":"Niger","continent":"Africa","capital":"Niamey","currency":"XOF","languages":["fr"]},{"code":"NG","flag":"🇳🇬","nameAr":"نيجيريا","nameEn":"Nigeria","continent":"Africa","capital":"Abuja","currency":"NGN","languages":["en"]},{"code":"MK","flag":"🇲🇰","nameAr":"مقدونيا الشمالية","nameEn":"North Macedonia","continent":"Europe","capital":"","currency":"","languages":[]},{"code":"NO","flag":"🇳🇴","nameAr":"النرويج","nameEn":"Norway","continent":"Europe","capital":"Oslo","currency":"NOK","languages":["no","nb","nn"]},{"code":"OM","flag":"🇴🇲","nameAr":"عُمان","nameEn":"Oman","continent":"Asia","capital":"Muscat","currency":"OMR","languages":["ar"]},{"code":"PK","flag":"🇵🇰","nameAr":"باكستان","nameEn":"Pakistan","continent":"Asia","capital":"Islamabad","currency":"PKR","languages":["en","ur"]},{"code":"PW","flag":"🇵🇼","nameAr":"بالاو","nameEn":"Palau","continent":"Oceania","capital":"Ngerulmud","currency":"USD","languages":["en"]},{"code":"PA","flag":"🇵🇦","nameAr":"بنما","nameEn":"Panama","continent":"North America","capital":"Panama City","currency":"PAB","languages":["es"]},{"code":"PG","flag":"🇵🇬","nameAr":"بابوا غينيا الجديدة","nameEn":"Papua New Guinea","continent":"Oceania","capital":"Port Moresby","currency":"PGK","languages":["en"]},{"code":"PY","flag":"🇵🇾","nameAr":"باراغواي","nameEn":"Paraguay","continent":"South America","capital":"Asunción","currency":"PYG","languages":["es","gn"]},{"code":"PE","flag":"🇵🇪","nameAr":"بيرو","nameEn":"Peru","continent":"South America","capital":"Lima","currency":"PEN","languages":["es"]},{"code":"PH","flag":"🇵🇭","nameAr":"الفلبين","nameEn":"Philippines","continent":"Asia","capital":"Manila","currency":"PHP","languages":["en"]},{"code":"PL","flag":"🇵🇱","nameAr":"بولندا","nameEn":"Poland","continent":"Europe","capital":"Warsaw","currency":"PLN","languages":["pl"]},{"code":"PT","flag":"🇵🇹","nameAr":"البرتغال","nameEn":"Portugal","continent":"Europe","capital":"Lisbon","currency":"EUR","languages":["pt"]},{"code":"QA","flag":"🇶🇦","nameAr":"قطر","nameEn":"Qatar","continent":"Asia","capital":"Doha","currency":"QAR","languages":["ar"]},{"code":"RO","flag":"🇷🇴","nameAr":"رومانيا","nameEn":"Romania","continent":"Europe","capital":"Bucharest","currency":"RON","languages":["ro"]},{"code":"RU","flag":"🇷🇺","nameAr":"روسيا","nameEn":"Russia","continent":"Europe","capital":"Moscow","currency":"RUB","languages":["ru"]},{"code":"RW","flag":"🇷🇼","nameAr":"رواندا","nameEn":"Rwanda","continent":"Africa","capital":"Kigali","currency":"RWF","languages":["rw","en","fr"]},{"code":"KN","flag":"🇰🇳","nameAr":"سانت كيتس ونيفيس","nameEn":"Saint Kitts and Nevis","continent":"North America","capital":"Basseterre","currency":"XCD","languages":["en"]},{"code":"LC","flag":"🇱🇨","nameAr":"سانت لوسيا","nameEn":"Saint Lucia","continent":"North America","capital":"Castries","currency":"XCD","languages":["en"]},{"code":"VC","flag":"🇻🇨","nameAr":"سانت فنسنت وجزر غرينادين","nameEn":"Saint Vincent and the Grenadines","continent":"North America","capital":"Kingstown","currency":"XCD","languages":["en"]},{"code":"WS","flag":"🇼🇸","nameAr":"ساموا","nameEn":"Samoa","continent":"Oceania","capital":"Apia","currency":"WST","languages":["sm","en"]},{"code":"SM","flag":"🇸🇲","nameAr":"سان مارينو","nameEn":"San Marino","continent":"Europe","capital":"City of San Marino","currency":"EUR","languages":["it"]},{"code":"ST","flag":"🇸🇹","nameAr":"ساو تومي وبرينسيبي","nameEn":"Sao Tome and Principe","continent":"Africa","capital":"","currency":"","languages":[]},{"code":"SA","flag":"🇸🇦","nameAr":"المملكة العربية السعودية","nameEn":"Saudi Arabia","continent":"Asia","capital":"Riyadh","currency":"SAR","languages":["ar"]},{"code":"SN","flag":"🇸🇳","nameAr":"السنغال","nameEn":"Senegal","continent":"Africa","capital":"Dakar","currency":"XOF","languages":["fr"]},{"code":"RS","flag":"🇷🇸","nameAr":"صربيا","nameEn":"Serbia","continent":"Europe","capital":"Belgrade","currency":"RSD","languages":["rs"]},{"code":"SC","flag":"🇸🇨","nameAr":"سيشل","nameEn":"Seychelles","continent":"Africa","capital":"Victoria","currency":"SCR","languages":["fr","en"]},{"code":"SL","flag":"🇸🇱","nameAr":"سيراليون","nameEn":"Sierra Leone","continent":"Africa","capital":"Freetown","currency":"SLL","languages":["en"]},{"code":"SG","flag":"🇸🇬","nameAr":"سنغافورة","nameEn":"Singapore","continent":"Asia","capital":"Singapore","currency":"SGD","languages":["en","ms","ta","zh"]},{"code":"SK","flag":"🇸🇰","nameAr":"سلوفاكيا","nameEn":"Slovakia","continent":"Europe","capital":"Bratislava","currency":"EUR","languages":["sk"]},{"code":"SI","flag":"🇸🇮","nameAr":"سلوفينيا","nameEn":"Slovenia","continent":"Europe","capital":"Ljubljana","currency":"EUR","languages":["sl"]},{"code":"SB","flag":"🇸🇧","nameAr":"جزر سليمان","nameEn":"Solomon Islands","continent":"Oceania","capital":"Honiara","currency":"SBD","languages":["en"]},{"code":"SO","flag":"🇸🇴","nameAr":"الصومال","nameEn":"Somalia","continent":"Africa","capital":"Mogadishu","currency":"SOS","languages":["so","ar"]},{"code":"ZA","flag":"🇿🇦","nameAr":"جنوب أفريقيا","nameEn":"South Africa","continent":"Africa","capital":"Pretoria","currency":"ZAR","languages":["af","en","nr","st"]},{"code":"SS","flag":"🇸🇸","nameAr":"جنوب السودان","nameEn":"South Sudan","continent":"Africa","capital":"Juba","currency":"SSP","languages":["en"]},{"code":"ES","flag":"🇪🇸","nameAr":"إسبانيا","nameEn":"Spain","continent":"Europe","capital":"Madrid","currency":"EUR","languages":["es"]},{"code":"LK","flag":"🇱🇰","nameAr":"سريلانكا","nameEn":"Sri Lanka","continent":"Asia","capital":"Colombo","currency":"LKR","languages":["si","ta"]},{"code":"SD","flag":"🇸🇩","nameAr":"السودان","nameEn":"Sudan","continent":"Africa","capital":"Khartoum","currency":"SDG","languages":["ar","en"]},{"code":"SR","flag":"🇸🇷","nameAr":"سورينام","nameEn":"Suriname","continent":"South America","capital":"Paramaribo","currency":"SRD","languages":["nl"]},{"code":"SE","flag":"🇸🇪","nameAr":"السويد","nameEn":"Sweden","continent":"Europe","capital":"Stockholm","currency":"SEK","languages":["sv"]},{"code":"CH","flag":"🇨🇭","nameAr":"سويسرا","nameEn":"Switzerland","continent":"Europe","capital":"Bern","currency":"CHE","languages":["de","fr","it"]},{"code":"SY","flag":"🇸🇾","nameAr":"سوريا","nameEn":"Syria","continent":"Asia","capital":"Damascus","currency":"SYP","languages":["ar"]},{"code":"TJ","flag":"🇹🇯","nameAr":"طاجيكستان","nameEn":"Tajikistan","continent":"Asia","capital":"Dushanbe","currency":"TJS","languages":["tg","ru"]},{"code":"TZ","flag":"🇹🇿","nameAr":"تنزانيا","nameEn":"Tanzania","continent":"Africa","capital":"Dodoma","currency":"TZS","languages":["sw","en"]},{"code":"TH","flag":"🇹🇭","nameAr":"تايلاند","nameEn":"Thailand","continent":"Asia","capital":"Bangkok","currency":"THB","languages":["th"]},{"code":"TL","flag":"🇹🇱","nameAr":"تيمور الشرقية","nameEn":"Timor-Leste","continent":"Asia","capital":"","currency":"","languages":[]},{"code":"TG","flag":"🇹🇬","nameAr":"توغو","nameEn":"Togo","continent":"Africa","capital":"Lomé","currency":"XOF","languages":["fr"]},{"code":"TO","flag":"🇹🇴","nameAr":"تونغا","nameEn":"Tonga","continent":"Oceania","capital":"Nuku'alofa","currency":"TOP","languages":["en","to"]},{"code":"TT","flag":"🇹🇹","nameAr":"ترينيداد وتوباغو","nameEn":"Trinidad and Tobago","continent":"North America","capital":"Port of Spain","currency":"TTD","languages":["en"]},{"code":"TN","flag":"🇹🇳","nameAr":"تونس","nameEn":"Tunisia","continent":"Africa","capital":"Tunis","currency":"TND","languages":["ar"]},{"code":"TR","flag":"🇹🇷","nameAr":"تركيا","nameEn":"Türkiye","continent":"Asia","capital":"","currency":"","languages":[]},{"code":"TM","flag":"🇹🇲","nameAr":"تركمانستان","nameEn":"Turkmenistan","continent":"Asia","capital":"Ashgabat","currency":"TMT","languages":["tk","ru"]},{"code":"TV","flag":"🇹🇻","nameAr":"توفالو","nameEn":"Tuvalu","continent":"Oceania","capital":"Funafuti","currency":"AUD","languages":["en"]},{"code":"UG","flag":"🇺🇬","nameAr":"أوغندا","nameEn":"Uganda","continent":"Africa","capital":"Kampala","currency":"UGX","languages":["en","sw"]},{"code":"UA","flag":"🇺🇦","nameAr":"أوكرانيا","nameEn":"Ukraine","continent":"Europe","capital":"Kiev","currency":"UAH","languages":["uk"]},{"code":"AE","flag":"🇦🇪","nameAr":"الإمارات العربية المتحدة","nameEn":"United Arab Emirates","continent":"Asia","capital":"Abu Dhabi","currency":"AED","languages":["ar"]},{"code":"GB","flag":"🇬🇧","nameAr":"المملكة المتحدة","nameEn":"United Kingdom","continent":"Europe","capital":"London","currency":"GBP","languages":["en"]},{"code":"US","flag":"🇺🇸","nameAr":"الولايات المتحدة","nameEn":"United States","continent":"North America","capital":"Washington D.C.","currency":"USD","languages":["en"]},{"code":"UY","flag":"🇺🇾","nameAr":"أورغواي","nameEn":"Uruguay","continent":"South America","capital":"Montevideo","currency":"UYI","languages":["es"]},{"code":"UZ","flag":"🇺🇿","nameAr":"أوزبكستان","nameEn":"Uzbekistan","continent":"Asia","capital":"Tashkent","currency":"UZS","languages":["uz","ru"]},{"code":"VU","flag":"🇻🇺","nameAr":"فانواتو","nameEn":"Vanuatu","continent":"Oceania","capital":"Port Vila","currency":"VUV","languages":["bi","en","fr"]},{"code":"VA","flag":"🇻🇦","nameAr":"الفاتيكان","nameEn":"Vatican City","continent":"Europe","capital":"","currency":"","languages":[]},{"code":"VE","flag":"🇻🇪","nameAr":"فنزويلا","nameEn":"Venezuela","continent":"South America","capital":"Caracas","currency":"VEF","languages":["es"]},{"code":"VN","flag":"🇻🇳","nameAr":"فيتنام","nameEn":"Vietnam","continent":"Asia","capital":"Hanoi","currency":"VND","languages":["vi"]},{"code":"YE","flag":"🇾🇪","nameAr":"اليمن","nameEn":"Yemen","continent":"Asia","capital":"Sana'a","currency":"YER","languages":["ar"]},{"code":"ZM","flag":"🇿🇲","nameAr":"زامبيا","nameEn":"Zambia","continent":"Africa","capital":"Lusaka","currency":"ZMK","languages":["en"]},{"code":"ZW","flag":"🇿🇼","nameAr":"زيمبابوي","nameEn":"Zimbabwe","continent":"Africa","capital":"Harare","currency":"USD","languages":["en","sn","nd"]},{"code":"PS","flag":"🇵🇸","nameAr":"فلسطين","nameEn":"Palestine","continent":"Asia","capital":"","currency":"","languages":[]}]);

  const CONTINENT_PROFILES = Object.freeze({"Asia":{"budgetLevel":3,"dailyAED":360,"flightAED":2600,"hotelNightAED":520,"bestMonths":[2,3,4,10,11],"seasons":["spring","autumn","winter"],"travelStyles":["family","culture","city","nature"],"flightHours":7.5},"Europe":{"budgetLevel":4,"dailyAED":520,"flightAED":2600,"hotelNightAED":760,"bestMonths":[4,5,6,9,10],"seasons":["spring","summer","autumn","winter"],"travelStyles":["city","culture","nature","premium"],"flightHours":7},"Africa":{"budgetLevel":3,"dailyAED":320,"flightAED":2200,"hotelNightAED":500,"bestMonths":[1,2,3,10,11,12],"seasons":["winter","spring","autumn"],"travelStyles":["nature","adventure","culture","beach"],"flightHours":6},"North America":{"budgetLevel":4,"dailyAED":620,"flightAED":4200,"hotelNightAED":900,"bestMonths":[4,5,6,9,10],"seasons":["spring","summer","autumn","winter"],"travelStyles":["city","nature","adventure","family"],"flightHours":14},"South America":{"budgetLevel":3,"dailyAED":380,"flightAED":5200,"hotelNightAED":550,"bestMonths":[3,4,5,9,10,11],"seasons":["spring","autumn"],"travelStyles":["nature","adventure","culture","city"],"flightHours":18},"Oceania":{"budgetLevel":4,"dailyAED":560,"flightAED":5000,"hotelNightAED":850,"bestMonths":[3,4,5,9,10,11],"seasons":["spring","summer","autumn"],"travelStyles":["nature","beach","adventure","family"],"flightHours":16},"Other":{"budgetLevel":3,"dailyAED":400,"flightAED":3000,"hotelNightAED":600,"bestMonths":[3,4,5,9,10,11],"seasons":["spring","autumn"],"travelStyles":["culture","city"],"flightHours":8}});

  const CURATED_OVERRIDES = Object.freeze({"AE":{"bestMonths":[11,12,1,2,3],"budget":{"level":4,"dailyAED":550,"flightAED":0,"hotelNightAED":850},"travelStyles":["premium","family","beach","city"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":3,"ideal":5,"max":8},"cities":["أبوظبي","دبي","الشارقة","رأس الخيمة"]},"KZ":{"bestMonths":[5,6,7,8,9],"budget":{"level":2,"dailyAED":250,"flightAED":1800,"hotelNightAED":350},"travelStyles":["nature","mountain","family","city"],"shattafAvailability":"medium","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":5,"ideal":7,"max":10},"cities":["ألماتي","أستانا","شيمكنت"]},"JP":{"bestMonths":[3,4,5,10,11],"budget":{"level":4,"dailyAED":500,"flightAED":3300,"hotelNightAED":700},"travelStyles":["culture","city","nature","premium"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":7,"ideal":10,"max":14},"cities":["طوكيو","كيوتو","أوساكا","هاكوني","أوكيناوا"]},"ES":{"bestMonths":[4,5,6,9,10],"budget":{"level":4,"dailyAED":500,"flightAED":2500,"hotelNightAED":700},"travelStyles":["culture","city","beach","family"],"shattafAvailability":"low","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":7,"ideal":10,"max":14},"cities":["مدريد","مالقة","ماربيا","فالنسيا","إشبيلية","غرناطة","سرقسطة"]},"CH":{"bestMonths":[5,6,7,8,9,12],"budget":{"level":5,"dailyAED":750,"flightAED":2600,"hotelNightAED":1100},"travelStyles":["nature","mountain","premium","family"],"shattafAvailability":"low","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":6,"ideal":9,"max":14},"cities":["زيورخ","إنترلاكن","لوسيرن","جنيف","زيرمات"]},"MY":{"bestMonths":[1,2,3,6,7,8],"budget":{"level":2,"dailyAED":260,"flightAED":2200,"hotelNightAED":380},"travelStyles":["family","city","nature","beach"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":6,"ideal":8,"max":12},"cities":["كوالالمبور","لنكاوي","بينانغ","كوتا كينابالو"]},"TH":{"bestMonths":[11,12,1,2,3],"budget":{"level":2,"dailyAED":280,"flightAED":2000,"hotelNightAED":400},"travelStyles":["beach","family","nature","city"],"shattafAvailability":"medium","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":6,"ideal":8,"max":12},"cities":["بانكوك","بوكيت","كرابي","شيانغ ماي"]},"MV":{"bestMonths":[11,12,1,2,3,4],"budget":{"level":5,"dailyAED":850,"flightAED":1900,"hotelNightAED":1800},"travelStyles":["beach","premium","relaxation","family"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":4,"ideal":5,"max":7},"cities":["ماليه","شمال ماليه أتول","جنوب ماليه أتول"]},"GE":{"bestMonths":[5,6,7,8,9,10],"budget":{"level":2,"dailyAED":230,"flightAED":1400,"hotelNightAED":320},"travelStyles":["nature","mountain","family","city"],"shattafAvailability":"low","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":5,"ideal":7,"max":10},"cities":["تبليسي","باتومي","كازبيجي","بورجومي"]},"TR":{"bestMonths":[4,5,6,9,10],"budget":{"level":3,"dailyAED":330,"flightAED":1700,"hotelNightAED":500},"travelStyles":["family","culture","city","nature"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":6,"ideal":8,"max":12},"cities":["إسطنبول","طرابزون","بورصة","أنطاليا","كابادوكيا"]},"ID":{"bestMonths":[4,5,6,7,8,9],"budget":{"level":2,"dailyAED":260,"flightAED":2600,"hotelNightAED":420},"travelStyles":["beach","nature","family","relaxation"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":7,"ideal":9,"max":14},"cities":["بالي","جاكرتا","لومبوك","باندونغ"]},"SG":{"bestMonths":[2,3,4,7,8,9],"budget":{"level":4,"dailyAED":560,"flightAED":2600,"hotelNightAED":850},"travelStyles":["city","family","premium","shopping"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":3,"ideal":5,"max":7},"cities":["سنغافورة"]},"KR":{"bestMonths":[4,5,9,10,11],"budget":{"level":4,"dailyAED":450,"flightAED":3000,"hotelNightAED":650},"travelStyles":["city","culture","nature","shopping"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":6,"ideal":8,"max":12},"cities":["سيول","بوسان","جيجو"]},"IT":{"bestMonths":[4,5,6,9,10],"budget":{"level":4,"dailyAED":550,"flightAED":2500,"hotelNightAED":800},"travelStyles":["culture","city","premium","family"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":7,"ideal":10,"max":14},"cities":["روما","ميلان","فلورنسا","فينيسيا","كومو"]},"FR":{"bestMonths":[4,5,6,9,10],"budget":{"level":5,"dailyAED":650,"flightAED":2600,"hotelNightAED":950},"travelStyles":["city","culture","premium","family"],"shattafAvailability":"low","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":6,"ideal":9,"max":13},"cities":["باريس","نيس","كان","ليون","آنسي"]},"AT":{"bestMonths":[5,6,7,8,9,12],"budget":{"level":4,"dailyAED":520,"flightAED":2500,"hotelNightAED":760},"travelStyles":["nature","city","culture","family"],"shattafAvailability":"low","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":5,"ideal":8,"max":12},"cities":["فيينا","سالزبورغ","إنسبروك","هالشتات"]},"GR":{"bestMonths":[5,6,9,10],"budget":{"level":4,"dailyAED":480,"flightAED":2300,"hotelNightAED":700},"travelStyles":["beach","culture","family","premium"],"shattafAvailability":"low","halal":{"friendly":true,"availability":"low"},"recommendedDays":{"min":6,"ideal":9,"max":13},"cities":["أثينا","سانتوريني","كريت","ميكونوس"]},"PT":{"bestMonths":[4,5,6,9,10],"budget":{"level":3,"dailyAED":430,"flightAED":2800,"hotelNightAED":650},"travelStyles":["city","beach","culture","family"],"shattafAvailability":"low","halal":{"friendly":true,"availability":"medium"},"recommendedDays":{"min":6,"ideal":8,"max":12},"cities":["لشبونة","بورتو","الغارف","سينترا"]},"BA":{"bestMonths":[5,6,7,8,9],"budget":{"level":2,"dailyAED":250,"flightAED":1800,"hotelNightAED":350},"travelStyles":["nature","family","culture","mountain"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":5,"ideal":7,"max":10},"cities":["سراييفو","موستار","بيهاتش"]},"AZ":{"bestMonths":[4,5,6,9,10],"budget":{"level":2,"dailyAED":260,"flightAED":1400,"hotelNightAED":360},"travelStyles":["city","nature","family","culture"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":4,"ideal":6,"max":9},"cities":["باكو","قبالا","شيكي","قوبا"]},"MA":{"bestMonths":[3,4,5,9,10,11],"budget":{"level":2,"dailyAED":260,"flightAED":2200,"hotelNightAED":380},"travelStyles":["culture","city","nature","family"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":6,"ideal":9,"max":13},"cities":["مراكش","الدار البيضاء","شفشاون","فاس","طنجة"]},"OM":{"bestMonths":[11,12,1,2,3],"budget":{"level":3,"dailyAED":380,"flightAED":700,"hotelNightAED":550},"travelStyles":["nature","family","beach","culture"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":3,"ideal":5,"max":8},"cities":["مسقط","صلالة","نزوى","صور"]},"SA":{"bestMonths":[11,12,1,2,3],"budget":{"level":3,"dailyAED":400,"flightAED":900,"hotelNightAED":600},"travelStyles":["family","culture","city","nature"],"shattafAvailability":"high","halal":{"friendly":true,"availability":"high"},"recommendedDays":{"min":3,"ideal":5,"max":8},"cities":["الرياض","جدة","العلا","أبها"]}});


  const MONTH_NAMES_AR = Object.freeze([
    "",
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر"
  ]);

  function clone(value) {
    if (value === undefined) return undefined;

    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function unique(values) {
    return [...new Set(safeArray(values).filter(Boolean))];
  }

  function deepMerge(base, override) {
    const result = clone(base);

    Object.entries(safeObject(override)).forEach(([key, value]) => {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = clone(value);
      }
    });

    return result;
  }

  function buildTemperatureProfile(continent) {
    const profiles = {
      Asia: [
        [8,18],[10,21],[14,25],[18,30],[22,34],[25,36],
        [26,37],[26,36],[23,33],[18,29],[13,24],[9,20]
      ],
      Europe: [
        [0,7],[1,9],[4,13],[7,17],[11,22],[15,26],
        [17,29],[17,28],[13,24],[9,18],[4,12],[1,8]
      ],
      Africa: [
        [14,27],[15,29],[17,31],[19,33],[21,35],[22,36],
        [22,35],[22,35],[21,34],[19,32],[17,30],[15,28]
      ],
      "North America": [
        [-2,7],[0,9],[4,14],[8,19],[13,24],[17,28],
        [20,31],[19,30],[15,26],[9,20],[4,13],[0,8]
      ],
      "South America": [
        [18,29],[18,29],[17,28],[15,26],[13,24],[11,22],
        [10,21],[11,22],[13,24],[15,26],[17,28],[18,29]
      ],
      Oceania: [
        [20,29],[20,29],[18,27],[15,24],[12,21],[10,19],
        [9,18],[10,19],[12,21],[14,23],[17,26],[19,28]
      ],
      Other: [
        [10,20],[11,21],[13,23],[15,25],[17,27],[19,29],
        [20,30],[20,30],[18,28],[16,26],[13,23],[11,21]
      ]
    };

    const values = profiles[continent] || profiles.Other;
    const result = {};

    values.forEach(([min, max], index) => {
      result[index + 1] = {
        min,
        max,
        rain: null,
        condition: null
      };
    });

    return result;
  }

  function buildDefaultCities(seed, override) {
    const names = safeArray(override.cities);

    if (names.length) {
      return names.map((name, index) => ({
        id: `${seed.code.toLowerCase()}_city_${index + 1}`,
        nameAr: name,
        nameEn: name,
        recommendedDays: index === 0 ? 3 : 2,
        tags: index === 0 ? ["main-city"] : ["recommended-city"],
        highlights: [],
        notes: ""
      }));
    }

    if (!seed.capital) return [];

    return [{
      id: `${seed.code.toLowerCase()}_capital`,
      nameAr: seed.capital,
      nameEn: seed.capital,
      recommendedDays: 3,
      tags: ["capital", "main-city"],
      highlights: [],
      notes: ""
    }];
  }

  function buildCountry(seed) {
    const profile =
      CONTINENT_PROFILES[seed.continent] ||
      CONTINENT_PROFILES.Other;

    const override = CURATED_OVERRIDES[seed.code] || {};

    const baseline = {
      id: seed.code,
      code: seed.code,
      iso2: seed.code,
      flag: seed.flag,
      nameAr: seed.nameAr,
      nameEn: seed.nameEn,
      aliases: unique([
        seed.nameAr,
        seed.nameEn,
        seed.code
      ]),
      continent: seed.continent,
      subregion: "",
      capital: seed.capital || "",
      currency: seed.currency || "",
      languages: safeArray(seed.languages),
      timezone: "",
      flightDurationFromAbuDhabiHours: profile.flightHours,
      visa: {
        status: "verify",
        note: "تحقق من متطلبات الدخول الرسمية قبل الحجز.",
        lastVerifiedAt: null
      },
      entryRequirements: [
        "جواز سفر صالح",
        "تحقق من التأشيرة ومتطلبات الدخول الرسمية",
        "راجع متطلبات التأمين الصحي إن وجدت"
      ],
      safety: {
        level: "verify",
        note: "راجع تنبيهات السفر الرسمية قبل الرحلة."
      },
      transport: {
        carRecommended: false,
        publicTransport: "verify",
        notes: ""
      },
      connectivity: {
        esim: "verify",
        sim: "verify",
        notes: ""
      },
      electricity: {
        voltage: null,
        plugTypes: [],
        adapterRecommended: true
      },
      halal: {
        friendly: false,
        availability: "verify",
        note: "ابحث عن المطاعم الحلال المعتمدة في المدينة المختارة."
      },
      shattafAvailability: "unknown",
      familyFriendly: true,
      recommendedDays: {
        min: 4,
        ideal: 7,
        max: 12
      },
      budget: {
        level: profile.budgetLevel,
        dailyAED: profile.dailyAED,
        flightAED: profile.flightAED,
        hotelNightAED: profile.hotelNightAED
      },
      seasons: safeArray(profile.seasons),
      bestMonths: safeArray(profile.bestMonths),
      monthsToAvoid: [],
      temperatures: buildTemperatureProfile(seed.continent),
      cities: [],
      hotels: [],
      attractions: [],
      beaches: [],
      halalRestaurants: [],
      shopping: [],
      experiences: [],
      travelStyles: safeArray(profile.travelStyles),
      tags: unique([
        seed.continent,
        ...safeArray(profile.travelStyles)
      ]),
      image: "",
      gallery: [],
      summary: `${seed.nameAr} وجهة ضمن ${seed.continent}. استخدم الدليل الذكي لاختيار الشهر والمدة والميزانية المناسبة.`,
      notes: "",
      dataQuality: CURATED_OVERRIDES[seed.code]
        ? "curated-baseline"
        : "global-baseline",
      sourceVersion: VERSION
    };

    const merged = deepMerge(baseline, override);

    merged.cities = buildDefaultCities(seed, override);
    merged.bestMonthNamesAr = merged.bestMonths.map(
      (month) => MONTH_NAMES_AR[month]
    );

    return merged;
  }

  const countries = Object.freeze(
    COUNTRY_SEEDS.map(buildCountry)
  );

  const countriesByCode = Object.freeze(
    countries.reduce((map, country) => {
      map[country.code] = country;
      return map;
    }, {})
  );

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("ar")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ");
  }

  function getCountries() {
    return countries.map(clone);
  }

  function getCountry(identifier) {
    const code = String(identifier || "").trim().toUpperCase();

    if (countriesByCode[code]) {
      return clone(countriesByCode[code]);
    }

    const target = normalizeText(identifier);

    const match = countries.find((country) =>
      country.aliases.some(
        (alias) => normalizeText(alias) === target
      )
    );

    return match ? clone(match) : null;
  }

  function search(query) {
    const target = normalizeText(query);

    if (!target) return getCountries();

    return countries
      .filter((country) =>
        normalizeText([
          country.nameAr,
          country.nameEn,
          country.code,
          country.continent,
          country.capital,
          ...country.aliases,
          ...country.cities.flatMap((city) => [
            city.nameAr,
            city.nameEn
          ])
        ].join(" ")).includes(target)
      )
      .map(clone);
  }

  function getByContinent(continent) {
    const target = normalizeText(continent);

    return countries
      .filter(
        (country) =>
          normalizeText(country.continent) === target
      )
      .map(clone);
  }

  function getStats() {
    const continents = countries.reduce((map, country) => {
      map[country.continent] =
        (map[country.continent] || 0) + 1;
      return map;
    }, {});

    return {
      version: VERSION,
      totalCountries: countries.length,
      curatedCountries: countries.filter(
        (country) =>
          country.dataQuality === "curated-baseline"
      ).length,
      continents
    };
  }

  const WorldGuideData = Object.freeze({
    VERSION,
    countries,
    getCountries,
    getCountry,
    search,
    getByContinent,
    getStats
  });

  global.WorldGuideData = WorldGuideData;
  global.WorldData = WorldGuideData;
  global.TRAVEL_COUNTRIES = countries;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = WorldGuideData;
  }
})(typeof window !== "undefined" ? window : globalThis);
