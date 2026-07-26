export interface YearAndSemester {
  code: string;
  displayName: string;
  default: boolean;
}

export interface YmsCache {
  lastUpdated: string;
  data: YearAndSemester[];
}

export interface CourseItem {
  code: string;
  name: string;
  class: string;
  time: string;
  teacher: string;
}

/**
 * 一門課的完整資料，發佈為 courses.json —— 全站唯一的課程來源。
 *
 * `code`（選課代碼）在一個學年期內唯一（114#1 實測 3514 個代碼，
 * (科目,分組,教師,時間) 零衝突），所以它是 teachers/locations/classes 三個索引檔
 * 與 /share 連結共用的 join key。
 *
 * 沒有任何單一端點涵蓋全部課程，這份資料是聯集：
 * - ag304_03（班級排課）覆蓋最廣，是基底
 * - ag203_1（科目與教師開課）是 ag304 的子集，只補 nameEn/capacity/mixedClass/note
 * - ag300_02（教師課表）、ag302_02（地點課表）各再補約 200 個前兩者沒有的代碼
 *
 * 刻意繼承 CourseItem，讓 web 端的 convert-course.ts 與 WeeklySchedule 不必改動。
 */
export interface Course extends CourseItem {
  /**
   * 開課班級代碼，取自「教學綱要」連結。`class` 是它的名稱（查得到才有）。
   * 與檢視中的班級不同時，代表這是他班開的課（例如資科系一的體育課由
   * 19071411 開），是使用者最容易困惑的地方。
   */
  classCode: string;
  /** 分組，如 "01" */
  group: string;
  /** 學分，如 "3.0"。體育等零學分課為 "0" */
  credits: string;
  /** 時數，如 "3.0" */
  hours: string;
  /** 必選修，已去掉【】，如 "必修" */
  required: string;
  /** 開課別，已去掉【】，如 "學期" */
  courseType: string;
  /** 校區，如 "博愛" */
  campus: string;
  /** 教室，如 "博愛G313"、"博愛B101舞蹈教室(一)"、"博愛教室未定" */
  classroom: string;
  /** 領域類，如 "系定必修"、"體育類" */
  category: string;
  /** 限制性別，如 "不限" */
  genderLimit: string;
  /**
   * 教學綱要鍵值，如 "19071411,05430.20" = 開課班級,科目代碼.分組。
   * ag304_03 與 ag203_1 都給同一把，是學校自己的課程identity。
   */
  syllabusKey: string;
  /**
   * 此課程出現在哪些系所 (unt_id) —— 包含「哪些系所的班級修這門課」(ag304)
   * 與「由哪個系所開課」(ag203_1)。/search 的系所篩選吃這個。
   */
  departmentCodes: string[];
  departments: string[];

  // —— 以下依來源而定，缺就是缺。不要為了整齊填空字串：ag203_1 只覆蓋約
  //    63% 的課，把「沒抓到」和「本來就空」混在一起，UI 就無法分辨要顯示
  //    「—」還是「無備註」。
  /** 英文課名（ag203_1） */
  nameEn?: string;
  /**
   * 修課人數上下限（ag203_1）。刻意不收「已選」人數 —— 它每天變，而爬蟲是
   * 週排程，發佈出去的數字會過期並誤導選課決定。
   */
  capacity?: { max: string; min: string };
  /** 合班班級（ag203_1），如「心諮碩三」 */
  mixedClass?: string;
  /** 備註（ag203_1），如「此課程為學分學程課程，非系專業選修」 */
  note?: string;
  /** 場地代碼（ag302_02） */
  locationCode?: string;
  /** 授課教師代碼（ag300_02） */
  teacherCodes?: string[];
}

/**
 * courses.json 以外的來源（ag300 教師課表、ag302 地點課表）只看得到 CourseItem
 * 那五欄，其餘一律沒有。用這個型別表達，就不必為了型別檢查而把「沒抓到」偽裝
 * 成空字串。
 */
export type PartialCourse = CourseItem & Partial<Omit<Course, keyof CourseItem>>;

/** 代碼 + 名稱，班級索引三層共用。 */
export interface ClassItem {
  code: string;
  name: string;
}

/** 系所 (unt_id) 及其班級，如 9100 資訊科學系 → 資科系一…資科職碩二 */
export interface ClassDepartment extends ClassItem {
  classes: ClassItem[];
}

/** 學院／開課單位 (dpt_id) 及其系所；classes.json 的頂層。 */
export interface ClassCollege extends ClassItem {
  departments: ClassDepartment[];
}

/**
 * 單一班級的整學期排課，發佈為 classes/<班級代碼>.json。
 *
 * 只存選課代碼，課程內容一律由 courses.json 查表 —— 這樣同一門課在 286 個
 * 班級檔裡不會各存一份，欄位也不會因為哪個檔先發佈而不一致。
 */
export interface ClassSchedule extends ClassItem {
  courseCodes: string[];
}

/**
 * 索引檔的共同形狀：某個維度 → 選課代碼清單，外加該來源看得到、但 courses.json
 * 沒有的課（ag300 約 213 筆、ag302 約 208 筆）。
 *
 * `extraCourses` 跟索引放同一個檔案是刻意的：courses.json 只由 fetchCourses 寫，
 * 每個檔案剛好一個 owner。若讓三支爬蟲都回寫 courses.json，在 `keep_files: true`
 * 的部署下兩個 workflow 一旦重疊，後部署的那份會蓋掉前一份的新增而且不會有任何
 * 錯誤 —— 是會無聲掉資料的競態。
 */
export interface CourseIndex<T> {
  entries: T[];
  extraCourses: PartialCourse[];
}

/** teachers.json：系級 → 教師 → 選課代碼 */
export interface TeacherEntry extends ClassItem {
  courseCodes: string[];
}

export interface TeacherUnit extends ClassItem {
  teachers: TeacherEntry[];
}

/** locations.json：場地 → 選課代碼 */
export interface LocationEntry extends ClassItem {
  courseCodes: string[];
}
