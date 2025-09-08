export interface YearAndSemester {
  code: string;
  displayName: string;
  default: boolean;
}

export interface CourseItem {
  code: string;
  name: string;
  class: string;
  time: string;
  teacher: string;
}
