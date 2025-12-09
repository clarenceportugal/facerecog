import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Card,
  Grid,
  Avatar,
} from "@mui/material";
import PeopleIcon from "@mui/icons-material/People";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { green, grey } from "@mui/material/colors";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import axios from "axios";
import { Chart } from "react-google-charts";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import AdminMain from "./AdminMain";
import { API_BASE_URL } from "../../utils/api";

interface Schedule {
  courseTitle: string;
  courseCode: string;
  instructor: {
    first_name: string;
    last_name: string;
  };
  room: string;
  startTime: string;
  endTime: string;
  semesterStartDate: string;
  semesterEndDate: string;
  section: {
    course: string;
    section: string;
    block: string;
  } | string | null;
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  };
}

const Dashboard: React.FC = () => {
  const [instructorCount, setinstructorCount] = useState<number | null>(null);
  const [schedulesCountToday, setSchedulesCountToday] = useState<number | null>(
    null
  );
  const [allFacultiesLogs, setAllFacultiesLogs] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [chartData, setChartData] = useState<any[][]>([]);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();

  const CourseName = localStorage.getItem("course") ?? "";
  const ShortCourseName = CourseName.replace(/^bs/i, "").toUpperCase();

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/auth/all-schedules/today`,
          {
            shortCourseName: ShortCourseName,
          }
        );
        console.log("Received today data:", response.data);
        setSchedules(response.data);
      } catch (error) {
        console.error("Error fetching schedules:", error);
      }
    };

    if (ShortCourseName) {
      fetchSchedules();
    }
  }, [ShortCourseName]);

  useEffect(() => {
    const fetchInstructorCount = async () => {
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/auth/count/instructors`,
          {
            params: { course: CourseName },
          }
        );
        setinstructorCount(response.data.count);
      } catch (error) {
        console.error("Failed to fetch instructor count:", error);
      }
    };

    if (CourseName) {
      fetchInstructorCount();
    }
  }, [CourseName]);

  useEffect(() => {
    const fetchSchedulesCountToday = async () => {
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/auth/schedules-count/today`,
          {
            params: { course: CourseName },
          }
        );
        setSchedulesCountToday(response.data.count);
      } catch (error) {
        console.error("Failed to fetch today's schedule count:", error);
      }
    };

    if (CourseName) {
      fetchSchedulesCountToday();
    }
  }, [CourseName]);

  useEffect(() => {
    const generateChartData = () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const date = today.getDate();

      const formattedData: any[][] = [
        [
          { type: "string", id: "Instructor" },
          { type: "string", id: "Subject" },
          { type: "date", id: "Start" },
          { type: "date", id: "End" },
        ],
      ];

      schedules.forEach((schedule) => {
        const [startHour, startMinute] = schedule.startTime
          .split(":")
          .map(Number);
        const [endHour, endMinute] = schedule.endTime.split(":").map(Number);

        const instructorName = schedule.instructor
          ? `${schedule.instructor.first_name} ${schedule.instructor.last_name}`
          : "Unknown";

        formattedData.push([
          instructorName,
          `${schedule.courseCode}`,
          new Date(year, month, date, startHour, startMinute),
          new Date(year, month, date, endHour, endMinute),
        ]);
      });

      setChartData(formattedData);
    };

    if (schedules.length > 0) {
      generateChartData();
    }
  }, [schedules]);

  const options = {
    timeline: {
      showRowLabels: true,
      groupByRowLabel: true,
    },
    avoidOverlappingGridLines: false,
    hAxis: {
      minValue: new Date(year, month, date, 7, 0), // Today 7AM
      maxValue: new Date(year, month, date, 18, 0), // Today 6PM
      ticks: Array.from(
        { length: 12 },
        (_, i) => new Date(year, month, date, 7 + i, 0)
      ),
      format: "ha",
      gridlines: {
        count: 12,
        units: {
          hours: { format: ["ha"] },
        },
      },
    },
  };

  useEffect(() => {
    const fetchAllFacultiesLogs = async () => {
      try {
        console.log("Sending request to fetch logs for course:", CourseName);

        const res = await axios.get(
          `${API_BASE_URL}/api/auth/logs/all-faculties/today`,
          {
            params: {
              courseName: CourseName,
            },
          }
        );

        console.log("Logs fetched successfully:", res.data);

        setAllFacultiesLogs(res.data);
      } catch (error) {
        console.error("Failed to fetch logs:", error);
        setAllFacultiesLogs([]);
      }
    };

    if (CourseName) {
      fetchAllFacultiesLogs();
    }
  }, [CourseName]);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <AdminMain>
      <Box display="flex" flexDirection="column" gap={3}>
        {/* Header Section */}
        <Box
          sx={{
            p: 3,
            backgroundColor: "#fff",
            borderRadius: 3,
            boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
          }}
        >
          <Typography variant="h4" fontWeight={700} color="#1a1a1a" gutterBottom>
            {CourseName ? CourseName.toUpperCase() : "Loading..."} Program Chairperson Dashboard
            </Typography>
          <Typography variant="body2" color="text.secondary">
            Overview of today's faculty information and schedules for the {CourseName ? CourseName.toUpperCase() : "Loading..."} program
            </Typography>
          </Box>

        {/* Stats Cards */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Card
              sx={{
                display: "flex",
                alignItems: "center",
                p: 2.5,
                borderRadius: 3,
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)",
                },
              }}
                >
              <Avatar
                sx={{
                  bgcolor: "#f3e8ff",
                  color: "#9f7aea",
                  mr: 2,
                  width: 56,
                  height: 56,
                }}
              >
                    <PeopleIcon />
                  </Avatar>
              <Box flex={1}>
                    <Typography
                  variant="h5"
                  fontWeight={700}
                      color="text.primary"
                    >
                      {instructorCount !== null
                        ? instructorCount.toLocaleString()
                    : "..."}
                    </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                      Total Faculties
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card
              sx={{
                display: "flex",
                alignItems: "center",
                p: 2.5,
                borderRadius: 3,
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)",
                },
              }}
                >
              <Avatar
                sx={{
                  bgcolor: "#fee2e2",
                  color: "#ef4444",
                  mr: 2,
                  width: 56,
                  height: 56,
                }}
              >
                    <HighlightOffIcon />
                  </Avatar>
              <Box flex={1}>
                    <Typography
                  variant="h5"
                  fontWeight={700}
                      color="text.primary"
                    >
                      0
                    </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  Absents Today
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card
              sx={{
                display: "flex",
                alignItems: "center",
                p: 2.5,
                borderRadius: 3,
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)",
                },
              }}
                >
              <Avatar
                sx={{
                  bgcolor: "#ffedd5",
                  color: "#fb923c",
                  mr: 2,
                  width: 56,
                  height: 56,
                }}
              >
                    <EventAvailableIcon />
                  </Avatar>
              <Box flex={1}>
                    <Typography
                  variant="h5"
                  fontWeight={700}
                      color="text.primary"
                    >
                      {schedulesCountToday !== null
                        ? schedulesCountToday.toLocaleString()
                    : "..."}
                    </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                      Classes Today
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card
              sx={{
                display: "flex",
                alignItems: "center",
                p: 2.5,
                borderRadius: 3,
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)",
                },
              }}
                >
              <Avatar
                sx={{
                  bgcolor: "#fef3c7",
                  color: "#f59e0b",
                  mr: 2,
                  width: 56,
                  height: 56,
                }}
              >
                    <WarningAmberIcon />
                  </Avatar>
              <Box flex={1}>
                    <Typography
                  variant="h5"
                  fontWeight={700}
                      color="text.primary"
                    >
                      0
                    </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                      Late Instructors
                    </Typography>
                  </Box>
                </Card>
              </Grid>
            </Grid>

        {/* Chart Section */}
            <Paper
              sx={{
                p: 3,
            borderRadius: 3,
            boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
            backgroundColor: "#fff",
              }}
            >
              <Typography
            variant="h6"
            fontWeight={700}
            color="#1a1a1a"
            mb={3}
            pb={2}
            borderBottom="2px solid #e0e0e0"
              >
            Today's Schedule Chart
              </Typography>
              <div style={{ width: "100%", height: "auto" }}>
                <Chart
                  chartType="Timeline"
                  data={chartData}
                  options={options}
                  width="100%"
                  height="auto"
                />
              </div>
            </Paper>

        {/* Schedules and Activity Section */}
        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Paper
              sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                backgroundColor: "#fff",
                overflow: "hidden",
              }}
            >
              <Typography
                variant="h6"
                fontWeight={700}
                color="#1a1a1a"
                mb={3}
                pb={2}
                borderBottom="2px solid #e0e0e0"
              >
                All Schedules Today
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#f1f3f4" }}>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                        S. No
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                        Instructor
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                        Start Time
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                        End Time
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                        Room
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                        Section
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                        Course
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schedules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 6, color: "text.secondary", fontStyle: "italic" }}>
                          No schedules found for today.
                        </TableCell>
                      </TableRow>
                    ) : (
                      schedules
                        .slice(
                          page * rowsPerPage,
                          page * rowsPerPage + rowsPerPage
                        )
                        .map((schedule, idx) => (
                          <TableRow
                            key={idx}
                            sx={{
                              backgroundColor: (page * rowsPerPage + idx) % 2 === 0 ? "#fafafa" : "white",
                              transition: "background-color 0.2s ease",
                              "&:hover": {
                                backgroundColor: "#f0f4ff",
                                transform: "scale(1.001)",
                              },
                            }}
                          >
                            <TableCell sx={{ fontWeight: 600, py: 1.5 }}>
                              {page * rowsPerPage + idx + 1}
                            </TableCell>
                            <TableCell sx={{ py: 1.5 }}>
                              {schedule.instructor
                                ? `${schedule.instructor.first_name} ${schedule.instructor.last_name}`
                                : "N/A"}
                            </TableCell>
                            <TableCell sx={{ py: 1.5 }}>{schedule.startTime}</TableCell>
                            <TableCell sx={{ py: 1.5 }}>{schedule.endTime}</TableCell>
                            <TableCell sx={{ py: 1.5 }}>{schedule.room}</TableCell>
                            <TableCell sx={{ py: 1.5 }}>
                              {schedule.section && typeof schedule.section === 'object'
                                ? `${schedule.section.course} - ${schedule.section.section}${schedule.section.block || ''}`
                                : schedule.section && typeof schedule.section === 'string'
                                ? schedule.section
                                : "N/A"}
                            </TableCell>
                            <TableCell sx={{ py: 1.5 }}>
                              {schedule.courseTitle} ({schedule.courseCode})
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25]}
                  component="div"
                  count={schedules.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  sx={{
                    borderTop: "1px solid #e0e0e0",
                    backgroundColor: "#fafafa",
                    px: 2,
                  }}
                />
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper
              sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                backgroundColor: "#fff",
                height: "100%",
              }}
            >
              <Typography
                variant="h6"
                fontWeight={700}
                color="#1a1a1a"
                mb={3}
                pb={2}
                borderBottom="2px solid #e0e0e0"
              >
                Today's Activity
              </Typography>
              <Box ml={1} pl={1} display="flex" flexDirection="column" gap={2}>
                {allFacultiesLogs.length === 0 ||
                !allFacultiesLogs.some((log) => log.timeIn || log.timeout) ? (
                  <Box
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="center"
                    py={4}
                  >
                  <Typography
                    variant="body2"
                      color="text.secondary"
                    textAlign="center"
                      fontStyle="italic"
                  >
                      No activity recorded today.
                  </Typography>
                  </Box>
                ) : (
                  allFacultiesLogs.map((log, index) => {
                    const entries = [];

                    if (log.timeIn) {
                      entries.push({ label: "Time In", time: log.timeIn });
                    }
                    if (log.timeout) {
                      entries.push({ label: "Time Out", time: log.timeout });
                    }

                    return entries.map((entry, subIndex, arr) => {
                      const parsed = dayjs(entry.time, "HH:mm");
                      const formattedTime = parsed.isValid()
                        ? parsed.format("hh:mm A")
                        : "Invalid time";

                      const isLastItem =
                        subIndex === arr.length - 1 &&
                        index === allFacultiesLogs.length - 1;

                      return (
                        <Box
                          key={`${index}-${subIndex}`}
                          display="flex"
                          position="relative"
                          pl={3}
                        >
                          {/* Circle and connecting line */}
                          <Box
                            position="absolute"
                            left={-12}
                            top={0}
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                          >
                            {/* Circle */}
                            <Box
                              width={12}
                              height={12}
                              borderRadius="50%"
                              bgcolor="white"
                              border={`2px solid ${green[400]}`}
                              zIndex={1}
                              mt={0.5}
                            />
                            {/* Connecting line */}
                            {!isLastItem && (
                              <Box
                                flex={1}
                                width={2}
                                bgcolor={green[300]}
                                mt={0.5}
                                style={{ minHeight: 36 }}
                              />
                            )}
                          </Box>

                          {/* Entry content */}
                          <Box>
                            <Typography fontWeight={600} fontSize={13}>
                              {entry.label} of{" "}
                              {log.instructorName || "Unknown Instructor"}
                            </Typography>
                            <Box
                              display="flex"
                              alignItems="center"
                              color="grey.500"
                            >
                              <AccessTimeIcon sx={{ fontSize: 12, mr: 0.5 }} />
                              <Typography variant="caption">
                                {formattedTime}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      );
                    });
                  })
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </AdminMain>
  );
};

export default Dashboard;
