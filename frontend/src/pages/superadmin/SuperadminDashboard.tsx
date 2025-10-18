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
  Card,
  Grid,
  Avatar,
  FormControl,
  InputLabel,
  MenuItem,
  SelectChangeEvent,
  Select,
  CircularProgress,
} from "@mui/material";
import SchoolIcon from "@mui/icons-material/School";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import PeopleIcon from "@mui/icons-material/People";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { green, grey } from "@mui/material/colors";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import axios from "axios";
import { Chart } from "react-google-charts";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import SuperadminMain from "./SuperadminMain";

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
    sectionName: string;
  };
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

const SuperAdminDashboard: React.FC = () => {
  const [counts, setCounts] = useState({
    dean: 0,
    programChairperson: 0,
    instructor: 0,
    superadmin: 0,
  });
  const [allFacultiesLogs, setAllFacultiesLogs] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [chartData, setChartData] = useState<any[][]>([
    [
      { type: "string", id: "Instructor" },
      { type: "string", id: "Subject" },
      { type: "date", id: "Start" },
      { type: "date", id: "End" },
    ],
  ]);

  const [colleges, setColleges] = useState([]);
  const [rooms, setRooms] = useState([]);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();

  const CourseName = localStorage.getItem("course") ?? "";
  const CollegeName = localStorage.getItem("college") ?? "";

  const [collegeValue, setCollegeValue] = useState("all");
  const [courseValue, setCourseValue] = useState("all");
  const [roomValue, setRoomValue] = useState("all");
  const [programs, setPrograms] = useState<any[]>([]);

  const shortCourseValue = courseValue.replace(/^bs/i, "").toUpperCase();
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingColleges, setLoadingColleges] = useState(false);

  const handleCollegeChange = async (code: string) => {
    setCollegeValue(code);
    setCourseValue("");
    console.log("Selected college:", code);

    setLoadingCourses(true);
    try {
      const res = await axios.post(
        "https://eduvision-dura.onrender.com/api/superadmin/selected-college",
        { collegeCode: code }
      );
      console.log("Courses under selected college:", res.data);
      setPrograms(res.data);
    } catch (error) {
      console.error("Failed to fetch courses for selected college:", error);
    } finally {
      setLoadingCourses(false);
    }
  };

  const handleCourseChange = (event: SelectChangeEvent) => {
    setCourseValue(event.target.value);
  };

  const handleRoomChange = (event: SelectChangeEvent) => {
    setRoomValue(event.target.value);
  };

  useEffect(() => {
    const fetchUserCounts = async () => {
      try {
        const res = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/user-counts"
        );
        setCounts(res.data);
      } catch (error) {
        console.error("Error fetching user counts:", error);
      }
    };

    fetchUserCounts();
  }, []);

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const response = await axios.post(
          "https://eduvision-dura.onrender.com/api/superadmin/all-schedules/today",
          {
            shortCourseValue: shortCourseValue,
          }
        );
        console.log("Received all schedules data:", response.data);
        setSchedules(response.data);
      } catch (error) {
        console.error("Error fetching schedules:", error);
      }
    };

    fetchSchedules();
  }, [shortCourseValue]);

  useEffect(() => {
    const fetchColleges = async () => {
      setLoadingColleges(true);
      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/colleges"
        );
        setColleges(response.data);
      } catch (error) {
        console.error("Failed to fetch colleges:", error);
      } finally {
        setLoadingColleges(false);
      }
    };

    fetchColleges();
  }, []);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/all-rooms/college",
          {
            params: { CollegeName },
          }
        );
        console.log("Rooms fetched:", response.data);
        setRooms(response.data);
      } catch (error) {
        console.error("Error fetching sections:", error);
      }
    };

    if (CollegeName) {
      fetchRooms();
    }
  }, [CollegeName]);

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

        formattedData.push([
          `${schedule.instructor.first_name} ${schedule.instructor.last_name}`,
          `${schedule.courseCode}`,
          new Date(year, month, date, startHour, startMinute),
          new Date(year, month, date, endHour, endMinute),
        ]);
      });

      setChartData(formattedData);
    };

    generateChartData(); // Call it unconditionally whenever schedules changes
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
        const res = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/logs/all-faculties/today",
          {
            params: {
              courseName: CourseName,
            },
          }
        );
        setAllFacultiesLogs(res.data);
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };

    fetchAllFacultiesLogs();
  }, []);

  return (
    <SuperadminMain>
      <Box sx={{ color: "grey.900", p: { xs: 2, sm: 3, md: 1 } }}>
        <Box maxWidth="1200px" mx="auto">
          {/* Header */}
          <Box mb={3}>
            <Typography variant="h4" fontWeight={600}>
              Super Admin Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              <span style={{ fontWeight: 400 }}>Dashboard</span> /{" "}
              <span style={{ fontStyle: "italic" }}>Attendance</span>
            </Typography>
          </Box>

          <Typography
            variant="h6"
            fontWeight="bold"
            color="text.primary"
            sx={{ mb: 0.5 }}
          >
            Total Users per Role:
          </Typography>

          <Box sx={{ pb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={1}
                  sx={{ display: "flex", alignItems: "center", p: 2 }}
                >
                  <Avatar sx={{ bgcolor: "#f3e8ff", color: "#9f7aea", mr: 2 }}>
                    <SchoolIcon />
                  </Avatar>
                  <Box>
                    <Typography
                      variant="h6"
                      fontWeight="600"
                      color="text.primary"
                    >
                      {counts.dean}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Dean
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={1}
                  sx={{ display: "flex", alignItems: "center", p: 2 }}
                >
                  <Avatar sx={{ bgcolor: "#f3e8ff", color: "#9f7aea", mr: 2 }}>
                    <EmojiEventsIcon />
                  </Avatar>
                  <Box>
                    <Typography
                      variant="h6"
                      fontWeight="600"
                      color="text.primary"
                    >
                      {counts.programChairperson}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Program Chairperson
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={1}
                  sx={{ display: "flex", alignItems: "center", p: 2 }}
                >
                  <Avatar sx={{ bgcolor: "#e0f2fe", color: "#38bdf8", mr: 2 }}>
                    <PeopleIcon />
                  </Avatar>
                  <Box>
                    <Typography
                      variant="h6"
                      fontWeight="600"
                      color="text.primary"
                    >
                      {counts.instructor}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Instructors
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card
                  elevation={1}
                  sx={{ display: "flex", alignItems: "center", p: 2 }}
                >
                  <Avatar sx={{ bgcolor: "#fce7f3", color: "#ec4899", mr: 2 }}>
                    <AdminPanelSettingsIcon />
                  </Avatar>
                  <Box>
                    <Typography
                      variant="h6"
                      fontWeight="600"
                      color="text.primary"
                    >
                      {counts.superadmin}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Superadmin
                    </Typography>
                  </Box>
                </Card>
              </Grid>
            </Grid>
          </Box>

          <Box
            display="grid"
            gridTemplateColumns={{ xs: "1fr", lg: "repeat(3, 1fr)" }}
            gap={3}
            mb={3}
          >
            {/* Bar Chart */}
            <Paper
              variant="outlined"
              sx={{
                p: 3,
                gridColumn: { md: "span 3" },
                maxHeight: 400,
                overflow: "auto",
              }}
            >
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={2}
              >
                <Typography
                  variant="subtitle2"
                  color="primary"
                  fontWeight={600}
                >
                  Today Schedule Chart
                </Typography>

                <Box display="flex" gap={2}>
                  {/* College Dropdown */}
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel id="college-filter-label">College</InputLabel>
                    <Select
                      labelId="college-filter-label"
                      id="college-filter"
                      value={collegeValue}
                      label="College"
                      onChange={(e) => handleCollegeChange(e.target.value)}
                      renderValue={(selected) =>
                        selected ||
                        (loadingColleges ? "Loading..." : "Select College")
                      }
                    >
                      {loadingColleges ? (
                        <MenuItem disabled>
                          <Box display="flex" alignItems="center" gap={1}>
                            <CircularProgress size={20} />
                            Loading Colleges...
                          </Box>
                        </MenuItem>
                      ) : (
                        colleges.map((college: any) => (
                          <MenuItem key={college._id} value={college.code}>
                            {college.name}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>

                  {/* Course Dropdown */}
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel id="course-filter-label">Course</InputLabel>
                    <Select
                      labelId="course-filter-label"
                      id="course-filter"
                      value={courseValue}
                      label="Course"
                      onChange={handleCourseChange}
                      renderValue={(selected) =>
                        selected?.toUpperCase() || "Select Course"
                      }
                    >
                      {loadingCourses ? (
                        <MenuItem disabled>
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                          Loading...
                        </MenuItem>
                      ) : programs.length > 0 ? (
                        programs.map((course: any) => (
                          <MenuItem
                            key={course._id}
                            value={course.code.toLowerCase()}
                          >
                            {course.code.toUpperCase()}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem disabled>No courses found</MenuItem>
                      )}
                    </Select>
                  </FormControl>

                  {/* Room Dropdown */}
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel id="room-filter-label">Room</InputLabel>
                    <Select
                      labelId="room-filter-label"
                      id="room-filter"
                      value={roomValue}
                      label="Room"
                      onChange={handleRoomChange}
                    >
                      {rooms.map((room: any) => (
                        <MenuItem key={room._id} value={room.name}>
                          {room.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <div style={{ width: "100%", height: "auto" }}>
                {chartData.length > 1 ? (
                  <Chart
                    chartType="Timeline"
                    data={chartData}
                    options={options}
                    width="100%"
                    height="auto"
                  />
                ) : (
                  <Box
                    height={200}
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    sx={{ color: "text.secondary", fontStyle: "italic" }}
                  >
                    No data available
                  </Box>
                )}
              </div>
            </Paper>
          </Box>

          <Box
            display="grid"
            gridTemplateColumns={{ xs: "1fr", md: "repeat(3, 1fr)" }}
            gap={3}
            mb={6}
          >
            <Paper
              variant="outlined"
              sx={{
                p: 3,
                gridColumn: { xs: "span 1", lg: "span 2" },
                overflowX: "auto",
              }}
            >
              <Typography
                variant="subtitle2"
                color="primary"
                fontWeight={600}
                mb={2}
              >
                All Schedules Today
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: grey[100] }}>
                      <TableCell sx={{ fontWeight: 600 }}>S. No</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Instructor</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Start Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>End Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Room</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Section</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Course</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schedules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          No schedules found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      schedules.map((schedule, idx) => (
                        <TableRow
                          key={idx}
                          sx={{
                            backgroundColor: idx % 2 === 0 ? "white" : grey[50],
                          }}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            {schedule.instructor
                              ? `${schedule.instructor.first_name} ${schedule.instructor.last_name}`
                              : "N/A"}
                          </TableCell>
                          <TableCell>{schedule.startTime}</TableCell>
                          <TableCell>{schedule.endTime}</TableCell>
                          <TableCell>{schedule.room}</TableCell>
                          <TableCell>
                            {schedule.section?.sectionName || "N/A"}
                          </TableCell>
                          <TableCell>
                            {schedule.courseTitle} ({schedule.courseCode})
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* Today Activity */}
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography
                variant="subtitle2"
                color="primary"
                fontWeight={600}
                mb={2}
              >
                Today Activity
              </Typography>
              <Box ml={1} pl={1} display="flex" flexDirection="column" gap={2}>
                {allFacultiesLogs.length === 0 ||
                !allFacultiesLogs.some((log) => log.timeIn || log.timeout) ? (
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    textAlign="center"
                  >
                    There is no current activity today.
                  </Typography>
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
          </Box>
        </Box>
      </Box>
    </SuperadminMain>
  );
};

export default SuperAdminDashboard;
