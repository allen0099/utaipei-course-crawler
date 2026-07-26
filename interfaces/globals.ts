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
 * 一列【班級排課清單】(ag304_03.jsp)。刻意繼承 CourseItem —— 該表的 `class`
 * 裝的是班級名稱（如「資科系一」），與 teachers.json / locations.json 同義，
 * 所以 web 端的 convert-course.ts 與 WeeklySchedule 不必為它改動。分組另放
 * `group`，因為 ag304_03 比其他兩張表多了一欄。
 */
export interface ClassCourseItem extends CourseItem {
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
   * 實際開課的班級代碼，取自「教學綱要」連結。與本班代碼不同時代表這是他班
   * 開的課（例如資科系一的體育課由 19071411 開），是使用者最容易困惑的地方。
   */
  hostClass: string;
}

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

/** 單一班級的整學期排課，發佈為 classes/<班級代碼>.json */
export interface ClassSchedule extends ClassItem {
  courses: ClassCourseItem[];
}
