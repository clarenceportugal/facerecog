//Dean Faculty Report
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  CircularProgress,
} from "@mui/material";
import DeanMain from "./DeanMain";
import axios from "axios";
import Swal from "sweetalert2";

interface Column {
  id: string;
  label: string;
  minWidth?: number;
  align?: "right";
}

interface AttendanceRow {
  key: string;
  name: string;
  courseCode: string;
  courseTitle: string;
  attendedHours: number;
  totalHours: number;
  room: string;
  absences: number;
  late: number;
}

interface LogDetail {
  date: string;
  timeIn: string;
  timeOut: string;
  attendedHours: number;
  status: string;
}

const columns: readonly Column[] = [
  { id: "name", label: "Instructor Name", minWidth: 120 },
  { id: "courseCode", label: "Course Code", minWidth: 50 },
  { id: "courseTitle", label: "Course Title", minWidth: 120 },
  { id: "attendedHours", label: "Attended Hours", minWidth: 100 },
  { id: "totalHours", label: "Total Hours", minWidth: 80 },
  { id: "room", label: "Room", minWidth: 70 },
  { id: "absences", label: "No. of Absences", minWidth: 100 },
  { id: "late", label: "No. of Late", minWidth: 100 },
];

const DeanFacultyReports: React.FC = React.memo(() => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDetails, setOpenDetails] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<LogDetail[]>([]);
  const [selectedInstructor, setSelectedInstructor] = useState("");

  // 🔹 Filters
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);

        // If no course selected, don't fetch yet (or fetch all if you want)
        if (!selectedCourse) {
          setAllLogs([]);
          setLoading(false);
          return;
        }

        const response = await axios.post(
          "http://localhost:5000/api/auth/dean-show-monthly-department-logs",
          { courseCode: selectedCourse } // 🔹 send course code instead of CollegeName
        );

        if (isMounted && response.data.success) {
          setAllLogs(response.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch attendance data:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [selectedCourse]); // 🔹 refetch when course changes

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const CollegeName = localStorage.getItem("college") ?? "";

        const response = await axios.post(
          "http://localhost:5000/api/auth/all-courses",
          { CollegeName }
        );

        if (response.data.success) setCourses(response.data.data);
      } catch (error) {
        console.error("Error fetching courses:", error);
      }
    };

    fetchCourses();
  }, []);

  // 🔹 Filter logs by month/year - memoized for performance
  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      // Filter out logs with null/undefined schedules
      if (!log.schedule || log.schedule === null || log.schedule === undefined) {
        return false;
      }
      
      const logDate = new Date(log.date);
      const year = logDate.getFullYear().toString();
      const month = (logDate.getMonth() + 1).toString().padStart(2, "0");

      const matchesYear = selectedYear ? year === selectedYear : true;
      const matchesMonth = selectedMonth ? month === selectedMonth : true;

      return matchesYear && matchesMonth;
    });
  }, [allLogs, selectedYear, selectedMonth]);

  // 🔹 Group filtered logs - memoized for performance
  const rows = useMemo(() => {
    const groupedData: Record<string, AttendanceRow> = {};

    filteredLogs.forEach((log: any) => {
      // Skip logs without valid schedules
      if (!log.schedule || !log.schedule._id) {
        return;
      }

      const instructorName = `${log.schedule?.instructor?.last_name ?? ""}, ${
        log.schedule?.instructor?.first_name ?? ""
      } ${
        log.schedule?.instructor?.middle_name
          ? log.schedule.instructor.middle_name.charAt(0) + "."
          : ""
      }`.trim() || "Unknown";

      const key = `${log.schedule._id}`;

      let sessionHours = 0;
      if (log.schedule?.startTime && log.schedule?.endTime) {
        const [startH, startM] = log.schedule.startTime.split(":").map(Number);
        const [endH, endM] = log.schedule.endTime.split(":").map(Number);
        sessionHours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
      }

      if (!groupedData[key]) {
        groupedData[key] = {
          key,
          name: instructorName,
          courseCode: log.schedule?.courseCode || log.course || "N/A",
          courseTitle: log.schedule?.courseTitle || "N/A",
          attendedHours: 0,
          totalHours: 0,
          room: log.schedule?.room || "N/A",
          absences: 0,
          late: 0,
        };
      }

      groupedData[key].totalHours += sessionHours;

      let attendedHours = 0;
      if (log.timeIn && log.timeout) {
        const [inH, inM] = log.timeIn.split(":").map(Number);
        const [outH, outM] = log.timeout.split(":").map(Number);
        attendedHours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
        attendedHours = Number(attendedHours.toFixed(3));
      }
      groupedData[key].attendedHours += attendedHours;

      if (log.status?.toLowerCase() === "absent")
        groupedData[key].absences += 1;
      if (log.status?.toLowerCase() === "late") groupedData[key].late += 1;
    });

    return Object.values(groupedData);
  }, [filteredLogs]);

  // 🔹 Handle row click to open details modal - memoized for performance
  const handleRowClick = useCallback(
    (row: AttendanceRow) => {
      const logs = filteredLogs.filter(
        (log: any) => log.schedule && log.schedule._id === row.key
      );
      const detailed: LogDetail[] = logs.map((log: any) => {
        let attended = 0;
        if (log.timeIn && log.timeout) {
          const [inH, inM] = log.timeIn.split(":").map(Number);
          const [outH, outM] = log.timeout.split(":").map(Number);
          attended = (outH * 60 + outM - (inH * 60 + inM)) / 60;
          attended = Number(attended.toFixed(3));
        }
        return {
          date: new Date(log.date).toLocaleDateString(),
          timeIn: log.timeIn || "-",
          timeOut: log.timeout || "-",
          attendedHours: attended,
          status: log.status,
        };
      });

      setSelectedLogs(detailed);
      setSelectedInstructor(row.name);
      setOpenDetails(true);
    },
    [filteredLogs]
  );

  // 🔹 Unique years from logs - memoized for performance
  const uniqueYears = useMemo(() => {
    return Array.from(
      new Set(allLogs.map((log) => new Date(log.date).getFullYear().toString()))
    );
  }, [allLogs]);

  // 🔹 Generate Report
  const handleGenerateReport = async () => {
    try {
      if (!selectedCourse) {
        Swal.fire({
          icon: "warning",
          title: "No Course Selected",
          text: "Please select a course before generating the report.",
        });
        return;
      }

      Swal.fire({
        title: "Generating Report...",
        text: "Please wait while we prepare your report.",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await axios.post(
        "http://localhost:5000/api/auth/dean-generate-monthly-department-logs",
        {
          courseCode: selectedCourse, // ✅ Send selected course
          selectedYear: selectedYear || null,
          selectedMonth: selectedMonth || null,
        },
        { 
          responseType: "blob",
          validateStatus: () => true // Don't throw for any status
        }
      );

      // Check if response is an error (status 400 or 500)
      if (response.status === 400 || response.status === 500) {
        // Response is JSON (error) - need to convert blob to text
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(response.data);
        });
        
        try {
          const errorData = JSON.parse(text);
          Swal.fire({
            icon: "warning",
            title: "No Data Available",
            text: errorData.message || "No attendance data found for the selected filters.",
          });
        } catch (e) {
          Swal.fire({
            icon: "error",
            title: "Error",
            text: "Failed to generate report. Please try again.",
          });
        }
        return;
      }

      // Response is blob (success)
      // 🧾 Use course code and selected filters in the filename
      const courseLabel = selectedCourse || "Course";
      const yearLabel = selectedYear ? `_${selectedYear}` : "";
      const monthLabel = selectedMonth
        ? `_${new Date(0, Number(selectedMonth) - 1).toLocaleString("en-US", {
            month: "long",
          })}`
        : "";

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${courseLabel}_AttendanceReport${yearLabel}${monthLabel}.docx`;
      a.click();
      window.URL.revokeObjectURL(url);

      Swal.fire({
        icon: "success",
        title: "Report Ready",
        text: "Your report has been downloaded successfully.",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error: any) {
      console.error("Error generating report:", error);
      
      // Try to extract error message from response
      let errorMessage = "Failed to generate report. Please try again.";
      if (error.response) {
        if (error.response.data instanceof Blob) {
          // Try to parse blob as JSON
          try {
            const text = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsText(error.response.data);
            });
            const errorData = JSON.parse(text);
            errorMessage = errorData.message || errorMessage;
          } catch (e) {
            // Not JSON, use default message
          }
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        }
      }
      
      Swal.fire({
        icon: "error",
        title: "Error",
        text: errorMessage,
      });
    }
  };

  return (
    <DeanMain>
      <Box display="flex" flexDirection="column" gap={3}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h4" fontWeight={700}>
              📊 Faculty Monthly Report
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Attendance summary of faculty members (filtered by month/year)
            </Typography>
          </Box>

          {/* 🔹 Year and Month Filters at top-right */}
          <Box display="flex" alignItems="center" gap={2}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Course</InputLabel>
              <Select
                value={selectedCourse}
                label="Course"
                onChange={(e) => {
                  const selected = e.target.value;
                  setSelectedCourse(selected);
                  console.log("📘 Selected Course:", selected); // ✅ Log selected course
                }}
                renderValue={(selected) => selected || "All"}
              >
                {courses.map((course) => (
                  <MenuItem key={course._id} value={course.code}>
                    {course.name} ({course.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Year</InputLabel>
              <Select
                value={selectedYear}
                label="Year"
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {uniqueYears.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Month</InputLabel>
              <Select
                value={selectedMonth}
                label="Month"
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {Array.from({ length: 12 }, (_, i) => {
                  const monthNum = (i + 1).toString().padStart(2, "0");
                  const monthName = new Date(0, i).toLocaleString("en-US", {
                    month: "long",
                  });
                  return (
                    <MenuItem key={monthNum} value={monthNum}>
                      {monthName}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Table */}
        <Paper elevation={4} sx={{ borderRadius: 3, overflow: "hidden" }}>
          <TableContainer sx={{ maxHeight: 500 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align={column.align}
                      sx={{
                        backgroundColor: "#f1f3f4",
                        color: "#333",
                        fontWeight: "bold",
                        fontSize: 14,
                      }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      align="center"
                      sx={{ py: 6 }}
                    >
                      <CircularProgress size={30} />
                      <Typography mt={2} variant="body2" color="text.secondary">
                        Loading attendance data...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : !selectedCourse ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      align="center"
                      sx={{ py: 6 }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Select course first in the course dropdown.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      align="center"
                      sx={{ py: 6 }}
                    >
                      No attendance records found for selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((row, idx) => (
                      <TableRow
                        hover
                        key={idx}
                        onClick={() => handleRowClick(row)}
                        sx={{
                          cursor: "pointer",
                          backgroundColor: idx % 2 === 0 ? "#fafafa" : "white",
                          "&:hover": { backgroundColor: "#f0f4ff" },
                        }}
                      >
                        {columns.map((column) => {
                          const value = (row as any)[column.id];
                          if (column.id === "absences")
                            return (
                              <TableCell key={column.id}>
                                <Chip
                                  label={value}
                                  color={value > 0 ? "error" : "default"}
                                  size="small"
                                />
                              </TableCell>
                            );
                          if (column.id === "late")
                            return (
                              <TableCell key={column.id}>
                                <Chip
                                  label={value}
                                  color={value > 0 ? "warning" : "default"}
                                  size="small"
                                />
                              </TableCell>
                            );
                          return <TableCell key={column.id}>{value}</TableCell>;
                        })}
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50]}
            component="div"
            count={rows.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>

        {/* Download button */}
        <Box display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            onClick={handleGenerateReport}
            sx={{
              px: 3,
              py: 1.5,
              borderRadius: 3,
              textTransform: "none",
              fontWeight: 600,
              background: "linear-gradient(45deg, #660708, #BA181B)",
              ":hover": {
                background: "linear-gradient(45deg, #BA181B, #E5383B)",
              },
            }}
          >
            📥 Generate & Download Report
          </Button>
        </Box>

        {/* Detailed Logs Dialog */}
        <Dialog
          open={openDetails}
          onClose={() => setOpenDetails(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              overflow: "hidden",
              boxShadow: 8,
            },
          }}
        >
          <Box
            sx={{
              background: "linear-gradient(135deg, #660708, #BA181B)",
              color: "white",
              p: 3,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Typography variant="h5" fontWeight={700}>
              {selectedInstructor}
            </Typography>
            {rows.find((r) => r.name === selectedInstructor) && (
              <>
                <Typography variant="subtitle1">
                  Course Code:{" "}
                  <Typography component="span" fontWeight={600}>
                    {
                      rows.find((r) => r.name === selectedInstructor)
                        ?.courseCode
                    }
                  </Typography>
                </Typography>
                <Typography variant="subtitle1">
                  Course Title:{" "}
                  <Typography component="span" fontWeight={600}>
                    {
                      rows.find((r) => r.name === selectedInstructor)
                        ?.courseTitle
                    }
                  </Typography>
                </Typography>
              </>
            )}
          </Box>

          <Box sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Attendance Details
            </Typography>
            <TableContainer
              component={Paper}
              elevation={2}
              sx={{ borderRadius: 2 }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Time In</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Time Out</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      Attended Hours
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        No logs available
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedLogs.map((log, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{log.date}</TableCell>
                        <TableCell>{log.timeIn}</TableCell>
                        <TableCell>{log.timeOut}</TableCell>
                        <TableCell>{log.attendedHours}</TableCell>
                        <TableCell>
                          <Chip
                            label={log.status}
                            color={
                              log.status.toLowerCase().includes("absent")
                                ? "error"
                                : log.status.toLowerCase().includes("late")
                                ? "warning"
                                : "success"
                            }
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box display="flex" justifyContent="flex-end" mt={3}>
              <Button
                onClick={() => setOpenDetails(false)}
                variant="contained"
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  fontWeight: 600,
                  background: "linear-gradient(45deg, #660708, #BA181B)",
                  ":hover": {
                    background: "linear-gradient(45deg, #BA181B, #E5383B)",
                  },
                }}
              >
                Close
              </Button>
            </Box>
          </Box>
        </Dialog>
      </Box>
    </DeanMain>
  );
});

DeanFacultyReports.displayName = "DeanFacultyReports";

export default DeanFacultyReports;
