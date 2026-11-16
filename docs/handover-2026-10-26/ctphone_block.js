  // ---------- mobile numbers from anywhere: the person picks the country (India is the start) and types the number as they know it. Nothing here is a check of the number itself: we only turn what was typed into +<country code><number> so the same person is the same person in every game. ----------
  const CT_ROWS = "AF|Afghanistan|93;AL|Albania|355;DZ|Algeria|213;AS|American Samoa|1;AD|Andorra|376;AO|Angola|244;AI|Anguilla|1;AG|Antigua and Barbuda|1;AR|Argentina|54;AM|Armenia|374;AW|Aruba|297;AU|Australia|61;AT|Austria|43;AZ|Azerbaijan|994;BS|Bahamas|1;BH|Bahrain|973;BD|Bangladesh|880;BB|Barbados|1;BY|Belarus|375;BE|Belgium|32;BZ|Belize|501;BJ|Benin|229;BM|Bermuda|1;BT|Bhutan|975;BO|Bolivia|591;BA|Bosnia and Herzegovina|387;BW|Botswana|267;BR|Brazil|55;VG|British Virgin Islands|1;BN|Brunei|673;BG|Bulgaria|359;BF|Burkina Faso|226;BI|Burundi|257;KH|Cambodia|855;CM|Cameroon|237;CA|Canada|1;CV|Cape Verde|238;KY|Cayman Islands|1;CF|Central African Republic|236;TD|Chad|235;CL|Chile|56;CN|China|86;CO|Colombia|57;KM|Comoros|269;CG|Congo|242;CD|Congo (Democratic Republic)|243;CK|Cook Islands|682;CR|Costa Rica|506;CI|Cote d'Ivoire|225;HR|Croatia|385;CU|Cuba|53;CW|Curacao|599;CY|Cyprus|357;CZ|Czechia|420;DK|Denmark|45;DJ|Djibouti|253;DM|Dominica|1;DO|Dominican Republic|1;EC|Ecuador|593;EG|Egypt|20;SV|El Salvador|503;GQ|Equatorial Guinea|240;ER|Eritrea|291;EE|Estonia|372;SZ|Eswatini|268;ET|Ethiopia|251;FK|Falkland Islands|500;FO|Faroe Islands|298;FJ|Fiji|679;FI|Finland|358;FR|France|33;GF|French Guiana|594;PF|French Polynesia|689;GA|Gabon|241;GM|Gambia|220;GE|Georgia|995;DE|Germany|49;GH|Ghana|233;GI|Gibraltar|350;GR|Greece|30;GL|Greenland|299;GD|Grenada|1;GP|Guadeloupe|590;GU|Guam|1;GT|Guatemala|502;GG|Guernsey|44;GN|Guinea|224;GW|Guinea-Bissau|245;GY|Guyana|592;HT|Haiti|509;HN|Honduras|504;HK|Hong Kong|852;HU|Hungary|36;IS|Iceland|354;IN|India|91;ID|Indonesia|62;IR|Iran|98;IQ|Iraq|964;IE|Ireland|353;IM|Isle of Man|44;IL|Israel|972;IT|Italy|39;JM|Jamaica|1;JP|Japan|81;JE|Jersey|44;JO|Jordan|962;KZ|Kazakhstan|7;KE|Kenya|254;KI|Kiribati|686;XK|Kosovo|383;KW|Kuwait|965;KG|Kyrgyzstan|996;LA|Laos|856;LV|Latvia|371;LB|Lebanon|961;LS|Lesotho|266;LR|Liberia|231;LY|Libya|218;LI|Liechtenstein|423;LT|Lithuania|370;LU|Luxembourg|352;MO|Macau|853;MG|Madagascar|261;MW|Malawi|265;MY|Malaysia|60;MV|Maldives|960;ML|Mali|223;MT|Malta|356;MH|Marshall Islands|692;MQ|Martinique|596;MR|Mauritania|222;MU|Mauritius|230;YT|Mayotte|262;MX|Mexico|52;FM|Micronesia|691;MD|Moldova|373;MC|Monaco|377;MN|Mongolia|976;ME|Montenegro|382;MS|Montserrat|1;MA|Morocco|212;MZ|Mozambique|258;MM|Myanmar|95;NA|Namibia|264;NR|Nauru|674;NP|Nepal|977;NL|Netherlands|31;NC|New Caledonia|687;NZ|New Zealand|64;NI|Nicaragua|505;NE|Niger|227;NG|Nigeria|234;KP|North Korea|850;MK|North Macedonia|389;MP|Northern Mariana Islands|1;NO|Norway|47;OM|Oman|968;PK|Pakistan|92;PW|Palau|680;PS|Palestine|970;PA|Panama|507;PG|Papua New Guinea|675;PY|Paraguay|595;PE|Peru|51;PH|Philippines|63;PL|Poland|48;PT|Portugal|351;PR|Puerto Rico|1;QA|Qatar|974;RE|Reunion|262;RO|Romania|40;RU|Russia|7;RW|Rwanda|250;KN|Saint Kitts and Nevis|1;LC|Saint Lucia|1;VC|Saint Vincent and the Grenadines|1;WS|Samoa|685;SM|San Marino|378;ST|Sao Tome and Principe|239;SA|Saudi Arabia|966;SN|Senegal|221;RS|Serbia|381;SC|Seychelles|248;SL|Sierra Leone|232;SG|Singapore|65;SX|Sint Maarten|1;SK|Slovakia|421;SI|Slovenia|386;SB|Solomon Islands|677;SO|Somalia|252;ZA|South Africa|27;KR|South Korea|82;SS|South Sudan|211;ES|Spain|34;LK|Sri Lanka|94;SD|Sudan|249;SR|Suriname|597;SE|Sweden|46;CH|Switzerland|41;SY|Syria|963;TW|Taiwan|886;TJ|Tajikistan|992;TZ|Tanzania|255;TH|Thailand|66;TL|Timor-Leste|670;TG|Togo|228;TO|Tonga|676;TT|Trinidad and Tobago|1;TN|Tunisia|216;TR|Turkey|90;TM|Turkmenistan|993;TC|Turks and Caicos Islands|1;TV|Tuvalu|688;UG|Uganda|256;UA|Ukraine|380;AE|United Arab Emirates|971;GB|United Kingdom|44;US|United States|1;UY|Uruguay|598;VI|US Virgin Islands|1;UZ|Uzbekistan|998;VU|Vanuatu|678;VA|Vatican City|39;VE|Venezuela|58;VN|Vietnam|84;YE|Yemen|967;ZM|Zambia|260;ZW|Zimbabwe|263";
  const CT_COUNTRIES = CT_ROWS.split(";").map((r) => { const p = r.split("|"); return { iso: p[0], name: p[1], dial: p[2] }; });
  const CT_INDIA = CT_COUNTRIES.find((c) => c.iso === "IN");
  const CT_BY_ISO = (iso) => CT_COUNTRIES.find((c) => c.iso === iso) || CT_INDIA;
  const CT_MAIN = { 1: "US", 7: "RU", 44: "GB", 39: "IT", 262: "RE" }; // a code that several places share: the biggest one is chosen when only the code is known
  const CT_BY_DIAL = (dial) => CT_COUNTRIES.find((x) => x.iso === CT_MAIN[dial]) || CT_COUNTRIES.find((x) => x.dial === dial);
  const CT_ZERO_STAYS = { CI: 1 }; // a country whose numbers really begin with 0 (the others drop the 0 people dial inside their own country)
  /** What the number box and the country list say, as one number. Country codes never start with 0 and none is the start of another, so a pasted +<code> is read exactly. India is held to the shape of an Indian mobile number; every other country is only held to the length the phone networks allow (8 to 15 digits in all), because the numbers of different countries are 8, 9, 10, 11 or 12 digits long and a real number must never be turned away for its length. */
  const CTPhone = {
    countries: CT_COUNTRIES,
    byIso: CT_BY_ISO,
    parse(iso, typed) {
      const t = String(typed == null ? "" : typed).trim();
      if (!t) return { ok: false, empty: true, why: "" };
      if (/[^\d\s+\-()./]/.test(t)) return { ok: false, why: "A mobile number has digits only. Spaces, + and - are fine." };
      let c = CT_BY_ISO(iso), d = t.replace(/\D/g, "");
      if (t[0] === "+" || t.slice(0, 2) === "00") { // a whole number with its country code: it says which country it is
        const n = d.replace(/^00/, ""), len = [1, 2, 3].find((k) => CT_COUNTRIES.some((x) => x.dial === n.slice(0, k)));
        if (!len) return { ok: false, why: "We do not know that country code. Choose the country from the list and type the rest of the number." };
        const dial = n.slice(0, len);
        if (c.dial !== dial) c = CT_BY_DIAL(dial);
        d = n.slice(len);
      } else if (c.dial === "91") {
        if (d.length === 12 && d.slice(0, 2) === "91") d = d.slice(2); // 91 98765 43210 typed without the plus
        else if (d.length === 11 && d[0] === "0") d = d.slice(1);
      } else if (d[0] === "0" && !CT_ZERO_STAYS[c.iso]) d = d.slice(1); // the 0 people dial inside their country is not part of the international number
      if (c.dial === "91") {
        if (d.length !== 10) return { ok: false, why: d.length < 10 ? "An Indian mobile number has 10 digits. Please check it." : "An Indian mobile number has 10 digits. Please remove the extra digits." };
        if (!/^[6-9]/.test(d)) return { ok: false, why: "An Indian mobile number starts with 6, 7, 8 or 9." };
      } else {
        const all = c.dial.length + d.length;
        if (all < 8) return { ok: false, why: "That looks too short for a mobile number in " + c.name + ". Please check it." };
        if (all > 15) return { ok: false, why: "That looks too long for a mobile number in " + c.name + ". Please check it." };
      }
      return { ok: true, iso: c.iso, cc: c.dial, national: d, e164: "+" + c.dial + d };
    },
    /** "+91 98765 43210" as shown back to the person */
    show(p) { return p && p.ok ? "+" + p.cc + " " + (p.cc === "91" ? p.national.slice(0, 5) + " " + p.national.slice(5) : p.national) : ""; },
  };
  window.CTPhone = CTPhone;
  const ccOptions = (sel) => [CT_INDIA].concat(CT_COUNTRIES.filter((c) => c.iso !== "IN").sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))).map((c) => `<option value="${c.iso}"${c.iso === sel ? " selected" : ""}>${esc(c.name)} (+${c.dial})</option>`).join("");
  const CC_KEY = "ctz-cc";

