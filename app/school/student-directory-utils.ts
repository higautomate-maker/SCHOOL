export type DirectoryStudent = {
  admissionNumber: string;
  rollNumber: string;
  fullName: string;
  className: string;
  sectionName: string;
  guardianName: string;
  guardianPhone: string;
  status: string;
};

export type StudentFilters = {
  className: string;
  sectionName: string;
  status: string;
  query: string;
};

export function filterStudentRecords<T extends DirectoryStudent>(students: T[], filters: StudentFilters): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return students.filter((student) =>
    (!filters.className || student.className === filters.className) &&
    (!filters.sectionName || student.sectionName === filters.sectionName) &&
    (!filters.status || student.status === filters.status) &&
    (!query || [student.admissionNumber, student.rollNumber, student.fullName,
      student.guardianName, student.guardianPhone].some((value) => value.toLocaleLowerCase().includes(query)))
  );
}

function csvCell(value: string): string {
  // Spreadsheet applications interpret cells beginning with these characters as formulas.
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function studentsCsv(students: DirectoryStudent[]): string {
  const fields: Array<[string, keyof DirectoryStudent]> = [
    ["Admission No", "admissionNumber"], ["Roll No", "rollNumber"],
    ["Student Name", "fullName"], ["Class", "className"],
    ["Section", "sectionName"], ["Guardian", "guardianName"],
    ["Phone", "guardianPhone"], ["Status", "status"],
  ];
  return [fields.map(([label]) => csvCell(label)).join(","),
    ...students.map((student) => fields.map(([, key]) => csvCell(student[key])).join(","))]
    .join("\r\n");
}
