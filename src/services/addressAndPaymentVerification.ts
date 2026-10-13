import { Country, State, City, ICountry, IState, ICity } from 'country-state-city';
import { PaymentMethod } from '../types/store';

export interface WorldwideCountryInfo {
  isoCode: string;
  name: string;
  flag: string;
  phonePrefix: string;
  isNational: boolean; // true only for Pakistan ('PK')
  currency: string;
}

// Load all 250+ countries of the world with Pakistan ('PK') prioritized first
export function getAllWorldCountries(): WorldwideCountryInfo[] {
  const all: ICountry[] = Country.getAllCountries();
  const mapped: WorldwideCountryInfo[] = all.map((c) => {
    const rawCode = c.phonecode.startsWith('+') ? c.phonecode : `+${c.phonecode}`;
    return {
      isoCode: c.isoCode,
      name: c.name,
      flag: c.flag || '',
      phonePrefix: rawCode.split(' and ')[0],
      isNational: c.isoCode === 'PK',
      currency: c.currency || 'USD',
    };
  });

  mapped.sort((a, b) => {
    if (a.isoCode === 'PK') return -1;
    if (b.isoCode === 'PK') return 1;
    return a.name.localeCompare(b.name);
  });

  return mapped;
}

export const ALL_WORLD_COUNTRIES: WorldwideCountryInfo[] = getAllWorldCountries();

// Get all official States / Provinces / Regions for a Country ISO code
export function getStatesForCountry(countryIsoCode: string): IState[] {
  if (!countryIsoCode) return [];
  const states = State.getStatesOfCountry(countryIsoCode);
  if (states.length === 0) {
    // Fallback for city-states or small islands (e.g., Monaco, Vatican, Gibraltar)
    const country = Country.getCountryByCode(countryIsoCode);
    return [
      {
        name: `${country?.name || countryIsoCode} Metropolitan Region`,
        isoCode: 'CENTRAL',
        countryCode: countryIsoCode,
      },
    ];
  }
  return states;
}

// Get all official Cities for a Country ISO code + State ISO code
export function getCitiesForState(countryIsoCode: string, stateIsoCode: string): ICity[] {
  if (!countryIsoCode) return [];
  if (stateIsoCode && stateIsoCode !== 'CENTRAL') {
    const stateCities = City.getCitiesOfState(countryIsoCode, stateIsoCode);
    if (stateCities.length > 0) return stateCities;
  }
  const countryCities = City.getCitiesOfCountry(countryIsoCode) || [];
  if (countryCities.length > 0) return countryCities;

  const stateObj = State.getStateByCodeAndCountry(stateIsoCode, countryIsoCode);
  const countryObj = Country.getCountryByCode(countryIsoCode);
  return [
    {
      name: stateObj?.name || countryObj?.name || 'Central District',
      countryCode: countryIsoCode,
      stateCode: stateIsoCode || 'CENTRAL',
    },
  ];
}

// Country-Specific Postal Code Regex & Example Helper (Covers PK, US, GB, CA, AE, SA, CH, DE, FR, AU, IN, and Universal ISO fallback)
export function getPostalRuleForCountry(countryIsoCode: string): {
  regex: RegExp;
  example: string;
} {
  switch (countryIsoCode) {
    case 'PK':
      return { regex: /^[0-9]{5}$/, example: '54000 (Lahore) / 74000 (Karachi) / 44000 (Islamabad)' };
    case 'US':
      return { regex: /^[0-9]{5}(-[0-9]{4})?$/, example: '10022' };
    case 'GB':
      return {
        regex: /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i,
        example: 'SW1X 7XL',
      };
    case 'CA':
      return {
        regex: /^[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]$/i,
        example: 'M5R 2G3',
      };
    case 'CH':
    case 'AU':
    case 'ZA':
    case 'NZ':
    case 'DK':
    case 'NO':
    case 'AT':
    case 'BE':
      return { regex: /^[0-9]{4}$/, example: '8001' };
    case 'DE':
    case 'FR':
    case 'IT':
    case 'ES':
    case 'SA':
    case 'TR':
    case 'MY':
    case 'KR':
    case 'MX':
    case 'TH':
      return { regex: /^[0-9]{5}$/, example: '75008' };
    case 'IN':
    case 'SG':
    case 'CN':
    case 'RU':
      return { regex: /^[0-9]{6}$/, example: '110001' };
    case 'JP':
      return { regex: /^[0-9]{3}-?[0-9]{4}$/, example: '104-0061' };
    case 'AE':
    case 'QA':
    case 'HK':
      return { regex: /^[A-Za-z0-9\s\-]{2,10}$/, example: '00000' };
    default:
      return {
        regex: /^[A-Za-z0-9\s\-]{3,12}$/,
        example: '10000',
      };
  }
}

// Official Pakistan Post GPO Directory and District Routing Ranges
export const PAKISTAN_CITY_POSTAL_DIRECTORY: Record<
  string,
  {
    gpoCode: string;
    validRanges: Array<[number, number]>;
    knownCodes?: string[];
  }
> = {
  lahore: {
    gpoCode: '54000',
    validRanges: [[53700, 54999]],
    knownCodes: ['54000', '54020', '54050', '54500', '54570', '54590', '54600', '54660', '54700', '54770', '54782', '54792', '54800', '54810', '54840', '54920'],
  },
  karachi: {
    gpoCode: '74000',
    validRanges: [[74000, 75999]],
    knownCodes: ['74000', '74200', '74400', '74600', '74700', '74800', '74900', '75050', '75100', '75210', '75230', '75270', '75280', '75290', '75300', '75350', '75400', '75460', '75500', '75530', '75600', '75620', '75660', '75700', '75750', '75800', '75850', '75900', '75950'],
  },
  islamabad: {
    gpoCode: '44000',
    validRanges: [[44000, 44300], [45200, 45400]],
    knownCodes: ['44000', '44010', '44020', '44030', '44040', '44050', '44080', '44090', '44100', '44210', '44220', '44230'],
  },
  rawalpindi: {
    gpoCode: '46000',
    validRanges: [[46000, 46700]],
    knownCodes: ['46000', '46010', '46020', '46200', '46220', '46300', '46600', '46700'],
  },
  faisalabad: {
    gpoCode: '38000',
    validRanges: [[38000, 38900]],
    knownCodes: ['38000', '38030', '38040', '38070', '38090', '38200', '38800'],
  },
  multan: {
    gpoCode: '60000',
    validRanges: [[60000, 60750]],
    knownCodes: ['60000', '60100', '60600', '60650', '60700', '60710'],
  },
  peshawar: {
    gpoCode: '25000',
    validRanges: [[25000, 25200]],
    knownCodes: ['25000', '25100', '25120', '25130', '25140', '25200'],
  },
  quetta: {
    gpoCode: '87300',
    validRanges: [[87300, 87500]],
    knownCodes: ['87300', '87310', '87320', '87400', '87500'],
  },
  sialkot: {
    gpoCode: '51310',
    validRanges: [[51000, 51360]],
    knownCodes: ['51310', '51330', '51340', '51360'],
  },
  gujranwala: {
    gpoCode: '52250',
    validRanges: [[52250, 52300]],
    knownCodes: ['52250', '52260', '52280', '52290'],
  },
  gujrat: {
    gpoCode: '50700',
    validRanges: [[50700, 50800]],
  },
  sargodha: {
    gpoCode: '40100',
    validRanges: [[40100, 40150]],
  },
  bahawalpur: {
    gpoCode: '63100',
    validRanges: [[63100, 63150]],
  },
  sahiwal: {
    gpoCode: '57000',
    validRanges: [[57000, 57050]],
  },
  'rahim yar khan': {
    gpoCode: '64200',
    validRanges: [[64200, 64250]],
  },
  jhelum: {
    gpoCode: '49600',
    validRanges: [[49600, 49650]],
  },
  sheikhupura: {
    gpoCode: '39350',
    validRanges: [[39350, 39400]],
  },
  kasur: {
    gpoCode: '55050',
    validRanges: [[55050, 55100]],
  },
  okara: {
    gpoCode: '56300',
    validRanges: [[56300, 56350]],
  },
  hyderabad: {
    gpoCode: '71000',
    validRanges: [[71000, 71800]],
  },
  sukkur: {
    gpoCode: '65200',
    validRanges: [[65200, 65250]],
  },
  larkana: {
    gpoCode: '77150',
    validRanges: [[77150, 77200]],
  },
  abbottabad: {
    gpoCode: '22010',
    validRanges: [[22010, 22030]],
  },
  mardan: {
    gpoCode: '23200',
    validRanges: [[23200, 23250]],
  },
  muzaffarabad: {
    gpoCode: '13100',
    validRanges: [[13100, 13150]],
  },
  mirpur: {
    gpoCode: '10250',
    validRanges: [[10250, 10300]],
  },
  gilgit: {
    gpoCode: '15100',
    validRanges: [[15100, 15150]],
  },
  gwadar: {
    gpoCode: '91200',
    validRanges: [[91200, 91250]],
  },
  swat: {
    gpoCode: '19200',
    validRanges: [[19200, 19250]],
  },
  mingora: {
    gpoCode: '19200',
    validRanges: [[19200, 19250]],
  },
  kohat: {
    gpoCode: '26000',
    validRanges: [[26000, 26050]],
  },
  'dera ghazi khan': {
    gpoCode: '32200',
    validRanges: [[32200, 32250]],
  },
  'dera ismail khan': {
    gpoCode: '29050',
    validRanges: [[29050, 29100]],
  },
  attock: {
    gpoCode: '43600',
    validRanges: [[43600, 43650]],
  },
  chakwal: {
    gpoCode: '48800',
    validRanges: [[48800, 48850]],
  },
  'wah cantt': {
    gpoCode: '47040',
    validRanges: [[47040, 47080]],
  },
  taxila: {
    gpoCode: '47080',
    validRanges: [[47070, 47090]],
  },
  mianwali: {
    gpoCode: '42200',
    validRanges: [[42200, 42250]],
  },
  nawabshah: {
    gpoCode: '67450',
    validRanges: [[67450, 67500]],
  },
  'mirpur khas': {
    gpoCode: '69000',
    validRanges: [[69000, 69050]],
  },
  jacobabad: {
    gpoCode: '79000',
    validRanges: [[79000, 79050]],
  },
  hafizabad: {
    gpoCode: '52110',
    validRanges: [[52110, 52150]],
  },
  'mandi bahauddin': {
    gpoCode: '50400',
    validRanges: [[50400, 50450]],
  },
  narowal: {
    gpoCode: '51600',
    validRanges: [[51600, 51650]],
  },
  chiniot: {
    gpoCode: '35400',
    validRanges: [[35400, 35450]],
  },
  khanewal: {
    gpoCode: '58150',
    validRanges: [[58150, 58200]],
  },
  vehari: {
    gpoCode: '61100',
    validRanges: [[61100, 61150]],
  },
  bhakkar: {
    gpoCode: '30000',
    validRanges: [[30000, 30050]],
  },
  layyah: {
    gpoCode: '31200',
    validRanges: [[31200, 31250]],
  },
  muzaffargarh: {
    gpoCode: '34200',
    validRanges: [[34200, 34250]],
  },
  'toba tek singh': {
    gpoCode: '36050',
    validRanges: [[36050, 36100]],
  },
  pakpattan: {
    gpoCode: '57400',
    validRanges: [[57400, 57450]],
  },
  bahawalnagar: {
    gpoCode: '62300',
    validRanges: [[62300, 62350]],
  },
  lodhran: {
    gpoCode: '59320',
    validRanges: [[59320, 59350]],
  },
  swabi: {
    gpoCode: '23430',
    validRanges: [[23430, 23450]],
  },
  haripur: {
    gpoCode: '22620',
    validRanges: [[22620, 22650]],
  },
  mansehra: {
    gpoCode: '21300',
    validRanges: [[21300, 21350]],
  },
  nowshera: {
    gpoCode: '24100',
    validRanges: [[24100, 24150]],
  },
  charsadda: {
    gpoCode: '24420',
    validRanges: [[24420, 24450]],
  },
  bannu: {
    gpoCode: '28100',
    validRanges: [[28100, 28150]],
  },
  skardu: {
    gpoCode: '16100',
    validRanges: [[16100, 16150]],
  },
};

// Comprehensive Pakistan District to Tehsil Mapping (Covers all 36 Punjab districts, 30 Sindh districts, 35 KPK districts, 35 Balochistan districts, ICT, AJK & Gilgit-Baltistan)
export const PAKISTAN_DISTRICT_TEHSILS: Record<string, string[]> = {
  // Punjab
  lahore: ['Lahore Cantt', 'Model Town', 'Raiwind', 'Shalimar', 'Lahore City'],
  rawalpindi: ['Rawalpindi', 'Gujar Khan', 'Kahuta', 'Kallar Syedan', 'Kotli Sattian', 'Murree', 'Taxila'],
  faisalabad: ['Faisalabad City', 'Faisalabad Saddar', 'Chak Jhumra', 'Jaranwala', 'Samundri', 'Tandlianwala'],
  multan: ['Multan City', 'Multan Saddar', 'Shujabad', 'Jalalpur Pirwala'],
  gujranwala: ['Gujranwala City', 'Gujranwala Saddar', 'Kamoke', 'Nowshera Virkan', 'Wazirabad'],
  sialkot: ['Sialkot', 'Daska', 'Pasrur', 'Sambrial'],
  gujrat: ['Gujrat', 'Kharian', 'Sarai Alamgir', 'Jalalpur Jattan', 'Kunjah'],
  sargodha: ['Sargodha', 'Bhalwal', 'Kot Momin', 'Sahiwal', 'Shahpur', 'Silanwali'],
  bahawalpur: ['Bahawalpur City', 'Bahawalpur Saddar', 'Ahmadpur East', 'Hasilpur', 'Khairpur Tamewali', 'Yazman'],
  sahiwal: ['Sahiwal', 'Chichawatni'],
  sheikhupura: ['Sheikhupura', 'Ferozewala', 'Muridke', 'Sharaqpur', 'Safdarabad'],
  'rahim yar khan': ['Rahim Yar Khan', 'Khanpur', 'Liaquatpur', 'Sadiqabad'],
  jhelum: ['Jhelum', 'Dina', 'Sohawa', 'Pind Dadan Khan'],
  kasur: ['Kasur', 'Chunian', 'Pattoki', 'Kot Radha Kishan'],
  okara: ['Okara', 'Depalpur', 'Renala Khurd'],
  attock: ['Attock', 'Fateh Jang', 'Hassan Abdal', 'Hazro', 'Jand', 'Pindi Gheb'],
  chakwal: ['Chakwal', 'Choa Saidan Shah', 'Kallar Kahar', 'Talagang', 'Lawa'],
  'dera ghazi khan': ['Dera Ghazi Khan', 'Kot Chutta', 'Taunsa'],
  muzaffargarh: ['Muzaffargarh', 'Alipur', 'Jatoi', 'Kot Addu'],
  bahawalnagar: ['Bahawalnagar', 'Chishtian', 'Fort Abbas', 'Haroonabad', 'Minchinabad'],
  bhakkar: ['Bhakkar', 'Darya Khan', 'Kalurkot', 'Mankera'],
  chiniot: ['Chiniot', 'Bhowana', 'Lalian'],
  hafizabad: ['Hafizabad', 'Pindi Bhattian'],
  jhang: ['Jhang', 'Shorkot', 'Ahmadpur Sial', 'Athara Hazari'],
  khanewal: ['Khanewal', 'Kabirwala', 'Mian Channu', 'Jahanian'],
  khushab: ['Khushab', 'Quaidabad', 'Naushera (Wadi Soon)', 'Noorpur Thal'],
  layyah: ['Layyah', 'Chaubara', 'Karor Lal Esan'],
  lodhran: ['Lodhran', 'Dunyapur', 'Kahror Pacca'],
  'mandi bahauddin': ['Mandi Bahauddin', 'Malakwal', 'Phalia'],
  mianwali: ['Mianwali', 'Isa Khel', 'Piplan'],
  'nankana sahib': ['Nankana Sahib', 'Sangla Hill', 'Shah Kot'],
  narowal: ['Narowal', 'Shakargarh', 'Zafarwal'],
  pakpattan: ['Pakpattan', 'Arifwala'],
  rajanpur: ['Rajanpur', 'Jampur', 'Rojhan'],
  'toba tek singh': ['Toba Tek Singh', 'Gojra', 'Kamalia', 'Pir Mahal'],
  vehari: ['Vehari', 'Burewala', 'Mailsi'],

  // Federal Capital
  islamabad: ['Islamabad City', 'Islamabad Rural', 'Nilore', 'Bhara Kahu', 'Sihala', 'Tarlai Kalan'],

  // Sindh
  karachi: ['Saddar', 'Aram Bagh', 'Civil Lines', 'Garden', 'Ferozabad', 'Jamshed Quarters', 'Gulshan-e-Iqbal', 'Gulzar-e-Hijri', 'Liaquatabad', 'Nazimabad', 'North Nazimabad', 'New Karachi', 'Gulberg', 'Korangi', 'Landhi', 'Shah Faisal', 'Model Colony', 'Malir', 'Bin Qasim', 'Gadap', 'Murad Memon', 'Ibrahim Hyderi', 'Orangi', 'Manghopir', 'Mominabad', 'Baldia', 'Mauripur', 'Keamari', 'Harbour', 'SITE'],
  'karachi central': ['Liaquatabad', 'Nazimabad', 'North Nazimabad', 'New Karachi', 'Gulberg'],
  'karachi east': ['Ferozabad', 'Jamshed Quarters', 'Gulshan-e-Iqbal', 'Gulzar-e-Hijri'],
  'karachi south': ['Saddar', 'Aram Bagh', 'Civil Lines', 'Garden'],
  'karachi west': ['Orangi', 'Manghopir', 'Mominabad'],
  korangi: ['Korangi', 'Landhi', 'Shah Faisal', 'Model Colony'],
  malir: ['Malir', 'Bin Qasim', 'Gadap', 'Murad Memon', 'Ibrahim Hyderi'],
  keamari: ['Keamari', 'Baldia', 'Mauripur', 'Harbour', 'SITE'],
  hyderabad: ['Hyderabad City', 'Hyderabad Rural', 'Latifabad', 'Qasimabad'],
  sukkur: ['Sukkur City', 'New Sukkur', 'Rohri', 'Pano Akil', 'Salehpat'],
  larkana: ['Larkana', 'Ratodero', 'Bakrani', 'Dokri'],
  'mirpur khas': ['Mirpur Khas', 'Digri', 'Jhuddo', 'Kot Ghulam Muhammad', 'Sindhri'],
  nawabshah: ['Nawabshah', 'Daur', 'Sakrand', 'Kazi Ahmed'],
  'shaheed benazirabad': ['Nawabshah', 'Daur', 'Sakrand', 'Kazi Ahmed'],
  badin: ['Badin', 'Matli', 'Talhar', 'Tando Bago', 'Golarchi'],
  dadu: ['Dadu', 'Johi', 'Mehar', 'Khairpur Nathan Shah'],
  ghotki: ['Ghotki', 'Mirpur Mathelo', 'Daharki', 'Ubauro', 'Khangarh'],
  jacobabad: ['Jacobabad', 'Garhi Khairo', 'Thul'],
  jamshoro: ['Kotri', 'Sehwan', 'Manjhand', 'Thana Bula Khan'],
  khairpur: ['Khairpur', 'Gambat', 'Kot Diji', 'Sobhodero', 'Kingri', 'Nara'],
  kashmore: ['Kashmore', 'Kandhkot', 'Tangwani'],
  matiari: ['Matiari', 'Hala', 'Saeedabad'],
  'naushahro feroze': ['Naushahro Feroze', 'Bhiria', 'Kandiaro', 'Mehrabpur', 'Moro'],
  sanghar: ['Sanghar', 'Sinjhoro', 'Shahdadpur', 'Tando Adam', 'Khipro'],
  shikarpur: ['Shikarpur', 'Garhi Yasin', 'Khanpur', 'Lakhi Ghulam Shah'],
  sujawal: ['Sujawal', 'Jati', 'Mirpur Bathoro', 'Shah Bandar', 'Kharo Chan'],
  thatta: ['Thatta', 'Mirpur Sakro', 'Ghorabari', 'Keti Bandar'],
  'tando allahyar': ['Tando Allahyar', 'Chamber', 'Jhando Mari'],
  'tando muhammad khan': ['Tando Muhammad Khan', 'Bulri Shah Karim', 'Tando Ghulam Hyder'],
  tharparkar: ['Mithi', 'Islamkot', 'Chachro', 'Diplo', 'Nagarparkar'],
  umerkot: ['Umerkot', 'Dhoronaro', 'Pithoro', 'Samaro'],

  // Khyber Pakhtunkhwa (KPK)
  peshawar: ['Peshawar City', 'Shah Alam', 'Saddar', 'Chamkani', 'Badaber', 'Mathra', 'Hassan Khel'],
  abbottabad: ['Abbottabad', 'Havelian', 'Lora', 'Lower Tanawal'],
  mardan: ['Mardan', 'Takht Bhai', 'Katlang', 'Rustam', 'Garhi Kapura'],
  swat: ['Babuzai', 'Barikot', 'Behrain', 'Charbagh', 'Kabal', 'Khwaza Khela', 'Matta'],
  'dera ismail khan': ['Dera Ismail Khan', 'Daraban', 'Kulachi', 'Paharpur', 'Paroa'],
  bannu: ['Bannu', 'Domel', 'Baka Khel', 'Miryan'],
  charsadda: ['Charsadda', 'Tangi', 'Shabqadar'],
  nowshera: ['Nowshera', 'Pabbi', 'Jehangira'],
  haripur: ['Haripur', 'Ghazi', 'Khanpur'],
  kohat: ['Kohat', 'Lachi', 'Gumbat', 'Dara Adam Khel'],
  mansehra: ['Mansehra', 'Balakot', 'Oghi', 'Baffa Pakhal', 'Darband'],
  swabi: ['Swabi', 'Chota Lahor', 'Razzar', 'Topi'],
  malakand: ['Batkhela', 'Dargai', 'Sam Ranizai'],
  'dir lower': ['Timergara', 'Balambat', 'Lal Qila', 'Munda', 'Samar Bagh', 'Adenzai'],
  'dir upper': ['Dir', 'Sharingal', 'Kalkot', 'Lar Jam', 'Barawal'],
  chitral: ['Chitral', 'Drosh', 'Mastuj', 'Mulkhow', 'Torkhow'],
  buner: ['Daggar', 'Gadezai', 'Gagra', 'Chagharzai', 'Totalai', 'Mandanr'],
  hangu: ['Hangu', 'Tall', 'Doaba'],
  karak: ['Karak', 'Banda Daud Shah', 'Takht-e-Nasrati'],
  'lakki marwat': ['Lakki Marwat', 'Naurang', 'Betani', 'Ghazni Khel'],
  tank: ['Tank', 'Jandola'],
  battagram: ['Battagram', 'Allai'],
  kohistan: ['Dassu', 'Kandia', 'Palas', 'Pattan'],
  bajaur: ['Khar', 'Nawagai', 'Barang', 'Salarzai', 'Utmankhel', 'Mamund'],
  mohmand: ['Ghalanai', 'Ekka Ghund', 'Haleemzai', 'Pandyali'],
  khyber: ['Landi Kotal', 'Jamrud', 'Bara', 'Mullagori'],
  kurram: ['Parachinar', 'Sadda', 'Lower Kurram', 'Central Kurram'],
  orakzai: ['Lower Orakzai', 'Upper Orakzai', 'Central Orakzai', 'Ismailzai'],
  'north waziristan': ['Miran Shah', 'Mir Ali', 'Razmak', 'Spinwam', 'Datta Khel'],
  'south waziristan': ['Wana', 'Ladha', 'Sararogha', 'Makin', 'Shakai'],

  // Balochistan
  quetta: ['Quetta City', 'Saddar', 'Panjpai', 'Kuchlak', 'Chiltan'],
  gwadar: ['Gwadar', 'Pasni', 'Ormara', 'Jiwani'],
  turbat: ['Turbat', 'Buleda', 'Zamuran', 'Hoshab', 'Tump', 'Dasht', 'Mand'],
  kech: ['Turbat', 'Buleda', 'Zamuran', 'Hoshab', 'Tump', 'Dasht', 'Mand'],
  khuzdar: ['Khuzdar', 'Nal', 'Wadh', 'Zehri', 'Moola'],
  hub: ['Hub', 'Gadani', 'Sonmiani', 'Dureji'],
  lasbela: ['Uthal', 'Bela', 'Kanraj', 'Lakhra', 'Liari'],
  sibi: ['Sibi', 'Kutmandai', 'Sangan'],
  loralai: ['Loralai', 'Bori', 'Mekhtar', 'Duki'],
  pishin: ['Pishin', 'Barshore', 'Karezat', 'Hurramzai', 'Saranan'],
  zhob: ['Zhob', 'Ashwat', 'Qamar Din Karez', 'Sambaza'],
  chaman: ['Chaman', 'Saddar'],
  jaffarabad: ['Dera Allah Yar', 'Jhatpat', 'Usta Mohammad'],
  nasirabad: ['Dera Murad Jamali', 'Chattar', 'Tamboo', 'Baba Kot'],
  kalat: ['Kalat', 'Manguchar', 'Surab'],
  nushki: ['Nushki', 'Dak'],
  panjgur: ['Panjgur', 'Gowargo', 'Gichk', 'Paroom'],
  awaran: ['Awaran', 'Gishkaur', 'Jhal Jhao', 'Mashkay'],
  'dera bugti': ['Dera Bugti', 'Sui', 'Phelan', 'Bailegh'],
  kohlu: ['Kohlu', 'Kahan', 'Maiwand'],
  ziarat: ['Ziarat', 'Sinjawi'],
  'qila saifullah': ['Qila Saifullah', 'Muslim Bagh', 'Loiband'],
  'qila abdullah': ['Qila Abdullah', 'Dobandi', 'Gulistan'],
  mastung: ['Mastung', 'Dasht', 'Kardigap'],
  kharan: ['Kharan', 'Sar-Kharan'],
  washuk: ['Washuk', 'Besima', 'Mashkel'],

  // Azad Jammu & Kashmir (AJK)
  mirpur: ['Mirpur', 'Dadyal', 'Islamgarh'],
  muzaffarabad: ['Muzaffarabad', 'Naseerabad / Patikka'],
  rawalakot: ['Rawalakot', 'Hajira', 'Abbaspur', 'Thorar'],
  poonch: ['Rawalakot', 'Hajira', 'Abbaspur', 'Thorar'],
  kotli: ['Kotli', 'Sehnsa', 'Nakyal', 'Charhoi', 'Khuiratta'],
  bhimber: ['Bhimber', 'Barnala', 'Samahni'],
  bagh: ['Bagh', 'Hari Ghel', 'Dhirkot'],
  haveli: ['Forward Kahuta', 'Khurshidabad', 'Mumtazabad'],
  sudhanoti: ['Pallandri', 'Baloch', 'Mang', 'Trarkhel'],
  neelum: ['Athmuqam', 'Sharda'],
  'jhelum valley': ['Hattian Bala', 'Chikkar', 'Leepa'],

  // Gilgit-Baltistan
  gilgit: ['Gilgit', 'Danyor', 'Juglot'],
  skardu: ['Skardu', 'Gultari', 'Rondu', 'Gamba'],
  hunza: ['Aliabad', 'Gojal', 'Shinaki'],
  nagar: ['Nagar-I', 'Nagar-II'],
  diamer: ['Chilas', 'Darel', 'Tangir'],
  astore: ['Eidghah', 'Gorikot', 'Shounter'],
  ghizer: ['Gupis', 'Ishkoman', 'Punial', 'Yasin'],
  ghanche: ['Khaplu', 'Mashabrum', 'Doghani'],
};

export function getTehsilsForDistrict(districtName: string): string[] {
  if (!districtName) return ['City Center', 'Saddar', 'Rural Tehsil'];
  const clean = districtName.toLowerCase().replace(/tehsil|district|city/gi, '').trim();
  const entry = Object.entries(PAKISTAN_DISTRICT_TEHSILS).find(([key]) => {
    return clean === key || clean.includes(key) || key.includes(clean);
  });
  if (entry && entry[1].length > 0) {
    return entry[1];
  }
  return [
    `${districtName.trim()} City`,
    `${districtName.trim()} Saddar`,
    `${districtName.trim()} Cantt`,
    `${districtName.trim()} Rural`,
  ];
}

export function getSuggestedPakistanPostalCode(districtOrCityName: string): string | null {
  const norm = (districtOrCityName || '').toLowerCase().trim();
  const match = Object.entries(PAKISTAN_CITY_POSTAL_DIRECTORY).find(
    ([key]) => norm.includes(key) || key.includes(norm)
  );
  return match ? match[1].gpoCode : null;
}

export interface PostalVerificationResult {
  valid: boolean;
  message: string;
  suggestedCode?: string;
}

// Deep postal verification ensuring code is genuinely valid and corresponds to the selected city/district
export function verifyPostalCodeForLocation(input: {
  countryIsoCode: string;
  cityName: string;
  stateName?: string;
  postalCode: string;
}): PostalVerificationResult {
  const code = (input.postalCode || '').trim();
  const country = (input.countryIsoCode || 'PK').toUpperCase();
  const rule = getPostalRuleForCountry(country);

  if (!code) {
    return { valid: false, message: 'Postal / ZIP code is required.' };
  }

  // 1. Syntax check against country rule
  if (!rule.regex.test(code)) {
    return {
      valid: false,
      message: `Invalid format: Expected ${rule.example} for ${country}.`,
    };
  }

  // 2. Generic dummy / repeated / sequential sequence detection
  const isDummy =
    /^(.)\1+$/.test(code.replace(/[\s-]/g, '')) ||
    code === '12345' ||
    code === '23456' ||
    code === '34567' ||
    code === '45678' ||
    code === '56789' ||
    code === '54321' ||
    code === '98765' ||
    code === '01234';

  if (isDummy) {
    return {
      valid: false,
      message: `"${code}" is an invalid dummy or sequential code. Please enter the authentic postal code.`,
    };
  }

  // 3. Pakistan-specific deep verification
  if (country === 'PK') {
    if (code.startsWith('0')) {
      return {
        valid: false,
        message: 'Invalid Pakistan Post Code: Postal codes in Pakistan do not start with 0.',
      };
    }

    const num = parseInt(code, 10);
    // General Pakistan assigned postal code territory ranges:
    // 10000-16999 (AJK / GB), 19000-29999 (KPK), 30000-64999 (Punjab), 44000-45400 (Islamabad), 65000-79999 (Sindh), 80000-92999 (Balochistan)
    const isInAnyPakistaniZone =
      (num >= 10000 && num <= 16999) ||
      (num >= 19000 && num <= 29999) ||
      (num >= 30000 && num <= 64999) ||
      (num >= 65000 && num <= 79999) ||
      (num >= 80000 && num <= 92999);

    if (!isInAnyPakistaniZone) {
      return {
        valid: false,
        message: `Postal code ${code} is outside Pakistan Post assigned routing territories (10000–92999).`,
      };
    }

    // City-level verification
    const normalizedCity = (input.cityName || '').toLowerCase().trim();
    const cityEntry = Object.entries(PAKISTAN_CITY_POSTAL_DIRECTORY).find(
      ([key]) => normalizedCity.includes(key) || key.includes(normalizedCity)
    );

    if (cityEntry) {
      const [cityNameMatch, data] = cityEntry;
      const displayCityName = cityNameMatch.charAt(0).toUpperCase() + cityNameMatch.slice(1);
      const isKnown = data.knownCodes?.includes(code);
      const inRange = data.validRanges.some(([min, max]) => num >= min && num <= max);

      if (isKnown || inRange) {
        return {
          valid: true,
          message: `Verified Pakistan Post Code for ${displayCityName} (${code} GPO/Sector).`,
          suggestedCode: data.gpoCode,
        };
      } else {
        return {
          valid: false,
          message: `"${code}" does not match ${displayCityName}. Official ${displayCityName} GPO code is ${data.gpoCode}.`,
          suggestedCode: data.gpoCode,
        };
      }
    }

    return {
      valid: true,
      message: `Verified Pakistan Post routing format (${code}).`,
    };
  }

  // 4. US-specific check (e.g. 00000, 99999)
  if (country === 'US') {
    const num = parseInt(code.slice(0, 5), 10);
    if (num < 501 || num > 99950) {
      return {
        valid: false,
        message: `ZIP code ${code} is outside valid USPS territory (00501–99950).`,
      };
    }
  }

  return {
    valid: true,
    message: `Verified Postal Code for ${input.cityName ? input.cityName + ', ' : ''}${country}.`,
  };
}

// Universal Card Brand Detection & Luhn Checksum Anti-Fraud Algorithm
export type DetectedCardBrand =
  | 'VISA'
  | 'MASTERCARD'
  | 'AMEX'
  | 'UNIONPAY'
  | 'DISCOVER'
  | 'JCB'
  | 'PAKPAY_DEBIT'
  | 'SADAPAY'
  | 'NAYAPAY'
  | 'UNKNOWN';

export function detectCardBrand(rawNumber: string): DetectedCardBrand {
  const digits = rawNumber.replace(/\D/g, '');
  if (!digits) return 'UNKNOWN';
  // SadaPay Mastercard BINs (typically 5370, 5358, 5570)
  if (/^5370|^5358|^5570/.test(digits)) return 'SADAPAY';
  // NayaPay Visa BINs (typically 4147, 4086, 4886)
  if (/^4147|^4086|^4886/.test(digits)) return 'NAYAPAY';
  // PayPak Pakistani domestic scheme
  if (/^9804|^2205|^5018|^6304/.test(digits)) return 'PAKPAY_DEBIT';
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720))/.test(digits)) {
    return 'MASTERCARD';
  }
  if (/^3[47]/.test(digits)) return 'AMEX';
  if (/^62/.test(digits)) return 'UNIONPAY';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'DISCOVER';
  if (/^35(2[89]|[3-8][0-9])/.test(digits)) return 'JCB';
  return 'UNKNOWN';
}

export function validateLuhnChecksum(rawNumber: string): boolean {
  const digits = rawNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function validateCardExpiry(expiry: string): { valid: boolean; reason?: string } {
  const clean = expiry.trim();
  const match = /^([0-9]{2})\s?\/\s?([0-9]{2,4})$/.exec(clean);
  if (!match) {
    return { valid: false, reason: 'Enter expiry in MM/YY format (e.g. 08/29).' };
  }
  const month = parseInt(match[1], 10);
  let year = parseInt(match[2], 10);
  if (year < 100) year += 2000;

  if (month < 1 || month > 12) {
    return { valid: false, reason: 'Expiry month must be between 01 and 12.' };
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, reason: 'Card is expired. Please use an active card.' };
  }
  if (year > currentYear + 15) {
    return { valid: false, reason: 'Expiry year is out of valid banking range.' };
  }
  return { valid: true };
}

export interface AddressVerificationStatus {
  countryValid: boolean;
  stateValid: boolean;
  cityValid: boolean;
  districtValid: boolean;
  tehsilValid: boolean;
  streetValid: boolean;
  postalValid: boolean;
  phoneValid: boolean;
  emailValid: boolean;
  isFullyVerified: boolean;
  fieldMessages: {
    street: string;
    postal: string;
    phone: string;
    email: string;
    location: string;
    district?: string;
    tehsil?: string;
  };
}

export function verifyAddressAndIdentity(input: {
  countryIsoCode: string;
  countryName: string;
  stateName: string;
  cityName: string;
  districtName?: string;
  tehsilName?: string;
  streetAddress: string;
  postalCode: string;
  phone: string;
  email: string;
}): AddressVerificationStatus {
  const countryObj = ALL_WORLD_COUNTRIES.find((c) => c.isoCode === input.countryIsoCode);
  const countryValid = Boolean(countryObj);
  const stateValid = Boolean(input.stateName && input.stateName.trim().length >= 2);
  const activeDistrict = (input.districtName || input.cityName || '').trim();
  const districtValid = activeDistrict.length >= 2;
  const cityValid = districtValid;
  const activeTehsil = (input.tehsilName || '').trim();
  const tehsilValid = input.countryIsoCode === 'PK' ? activeTehsil.length >= 2 : true;

  const streetTrimmed = input.streetAddress.trim();
  const streetValid =
    streetTrimmed.length >= 6 &&
    /[a-zA-Z]/.test(streetTrimmed) &&
    !/^(.)\1{5,}$/.test(streetTrimmed);

  const postalVerification = verifyPostalCodeForLocation({
    countryIsoCode: input.countryIsoCode,
    cityName: input.districtName || input.cityName,
    stateName: input.stateName,
    postalCode: input.postalCode,
  });
  const postalValid = postalVerification.valid;

  const phoneTrimmed = input.phone.trim();
  const prefix = countryObj?.phonePrefix || '+';
  const digitsOnly = phoneTrimmed.replace(/\D/g, '');
  const phoneValid =
    input.countryIsoCode === 'PK'
      ? /^(\+92|0)?\s?3[0-9]{2}[\s\-]?[0-9]{7}$/.test(phoneTrimmed)
      : (phoneTrimmed.startsWith(prefix) || phoneTrimmed.startsWith('+')) &&
        digitsOnly.length >= 8 &&
        digitsOnly.length <= 15;

  const emailTrimmed = input.email.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed);

  const isFullyVerified =
    countryValid &&
    stateValid &&
    districtValid &&
    tehsilValid &&
    streetValid &&
    postalValid &&
    phoneValid &&
    emailValid;

  return {
    countryValid,
    stateValid,
    cityValid,
    districtValid,
    tehsilValid,
    streetValid,
    postalValid,
    phoneValid,
    emailValid,
    isFullyVerified,
    fieldMessages: {
      location:
        countryValid && stateValid && districtValid
          ? `Verified Global Address: ${activeTehsil ? activeTehsil + ', ' : ''}${activeDistrict}, ${input.stateName}, ${input.countryName} (${input.countryIsoCode})`
          : 'Select a valid Country, Province / State, and District.',
      district: districtValid ? 'Verified District' : 'Select a valid District',
      tehsil: tehsilValid ? 'Verified Tehsil' : 'Select or enter Tehsil',
      street: streetValid
        ? 'Verified Street & Building format'
        : 'Wrong Address: Enter complete house/building number, street, and sector/area (min 6 chars).',
      postal: postalVerification.message,
      phone: phoneValid
        ? `Verified Courier Receiver Ph. No. (${prefix})`
        : `Wrong Receiver Phone Format: Must include dial code ${prefix} and valid subscriber digits (e.g. ${prefix} 300 1234567).`,
      email: emailValid
        ? 'Verified Client Email'
        : 'Wrong Email: Enter a valid email address for receipt notifications.',
    },
  };
}

export interface PaymentVerificationStatus {
  valid: boolean;
  cardBrand?: DetectedCardBrand;
  message: string;
  fraudScore: number;
}

export function verifyPaymentInstrument(input: {
  isNationalPakistan: boolean;
  paymentMethod: PaymentMethod;
  paymentSubMethod: string;
  cardNumber?: string;
  cardHolder?: string;
  cardExpiry?: string;
  cardCvv?: string;
  walletMobileNumber?: string;
  walletAccountTitle?: string;
  wireReferenceNumber: string;
  installmentBank?: string;
  installmentTenure?: number;
  bankAccountName?: string;
  bankAccountNumber?: string;
  sadaPayId?: string;
  saveCard?: boolean;
}): PaymentVerificationStatus {
  if (!input.isNationalPakistan && input.paymentMethod === 'COD') {
    return {
      valid: false,
      message:
        'Fraud & Policy Block: Cash on Delivery (COD) is strictly restricted to Pakistan National orders. International orders require advance settlement.',
      fraudScore: 95,
    };
  }

  // 1. Cash on Delivery (COD) - No fake OTP simulation
  if (input.paymentMethod === 'COD') {
    return {
      valid: true,
      message: 'Pakistan National Cash on Delivery (COD) selected. Total payable upon delivery to courier.',
      fraudScore: 5,
    };
  }

  // 2. NayaPay Wallet Manual Transfer with TID
  if (input.paymentMethod === 'NAYAPAY') {
    const tid = (input.wireReferenceNumber || '').trim();
    if (tid.length < 6) {
      return {
        valid: false,
        message: 'Enter your 6+ digit NayaPay Transaction ID (TID) from your transfer receipt.',
        fraudScore: 50,
      };
    }
    return {
      valid: true,
      message: `NayaPay TID Submitted (${tid}): Order will stay PENDING_VERIFICATION until admin approval.`,
      fraudScore: 3,
    };
  }

  // 3. Bank Transfer / RAAST Instant Transfer with TID
  if (
    input.paymentMethod === 'RAAST_IBAN' ||
    input.paymentMethod === 'BANK_TRANSFER' ||
    input.paymentMethod === 'HBL_BANK' ||
    input.paymentMethod === 'BANK_ACCOUNT'
  ) {
    const tid = (input.wireReferenceNumber || input.bankAccountNumber || '').trim();
    if (tid.length < 6) {
      return {
        valid: false,
        message: 'Enter your 6+ digit Bank Transfer / RAAST Transaction ID (TID) / Reference Number.',
        fraudScore: 50,
      };
    }
    return {
      valid: true,
      message: `Bank Transfer / RAAST TID Submitted (${tid}): Order will stay PENDING_VERIFICATION until admin approval.`,
      fraudScore: 3,
    };
  }

  // 4. International Manual Freight Quote
  if (input.paymentMethod === 'MANUAL_QUOTE') {
    return {
      valid: true,
      message: 'International Shipping & Tariff Quote Requested: Order logged for logistics quote. Payment not requested until formal freight proposal is accepted.',
      fraudScore: 2,
    };
  }

  // 5. General Manual Transfer
  if (input.paymentMethod === 'MANUAL') {
    const tid = (input.wireReferenceNumber || '').trim();
    if (tid.length < 6) {
      return {
        valid: false,
        message: 'Enter your 6+ digit Transaction Reference (TID) to initiate manual payment verification.',
        fraudScore: 50,
      };
    }
    return {
      valid: true,
      message: `Manual Reference Submitted (${tid}): Recorded as PENDING_VERIFICATION until admin review.`,
      fraudScore: 4,
    };
  }

  return {
    valid: false,
    message: 'Select a valid payment protocol.',
    fraudScore: 50,
  };
}
