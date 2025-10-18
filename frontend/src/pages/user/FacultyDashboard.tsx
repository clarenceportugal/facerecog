import React, { useState, useEffect } from "react";
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
  LinearProgress,
} from "@mui/material";
import { green, red, yellow, blue, grey } from "@mui/material/colors";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import axios from "axios";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import UserMain from "./UserMain";

interface Schedule {
  startTime: string;
  endTime: string;
  room: string;
}

const FacultyDashboard: React.FC = () => {
  const [nextSchedule, setNextSchedule] = useState<Schedule | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [totalHoursToday, setToday] = useState(0);
  const [totalHoursWeek, setWeek] = useState(0);
  const [totalHoursMonth, setMonth] = useState(0);
  const [totalExpectedHoursToday, setExpectedToday] = useState(0);
  const [totalExpectedHoursWeek, setExpectedWeek] = useState(0);
  const [totalExpectedHoursMonth, setExpectedMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const facultyId = localStorage.getItem("userId");
  const [logs, setLogs] = useState<{ timeIn?: string; timeout?: string }[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        if (!facultyId) return;
        
        const res = await axios.get(
          `http://localhost:5000/api/auth/logs/all/today/${facultyId}`
        );
        setLogs(res.data);
      } catch (error) {
        console.error("Failed to fetch logs:", error);
        setLogs([]); // Set empty array on error
      }
    };

    fetchLogs();
  }, [facultyId]);

  useEffect(() => {
    const fetchExpectedHours = async () => {
      try {
        if (!facultyId) return;

        const response = await axios.get(
          `http://localhost:5000/api/auth/expected-hours/today/${facultyId}`
        );

        const {
          totalTodayScheduleHours,
          totalThisWeekScheduleHours,
          totalThisMonthScheduleHours,
        } = response.data;

        setExpectedToday(totalTodayScheduleHours || 0);
        setExpectedWeek(totalThisWeekScheduleHours || 0);
        setExpectedMonth(totalThisMonthScheduleHours || 0);
      } catch (err) {
        console.error("Failed to fetch expected hours", err);
        // Set default values on error
        setExpectedToday(0);
        setExpectedWeek(0);
        setExpectedMonth(0);
      }
    };

    fetchExpectedHours();
  }, [facultyId]);

  useEffect(() => {
    const fetchNextSchedule = async () => {
      try {
        if (!facultyId) return;
        
        const response = await axios.get(
          `http://localhost:5000/api/auth/next-schedule/${facultyId}`
        );
        setNextSchedule(response.data);
      } catch (error) {
        console.error("No upcoming schedule or error:", error);
        setNextSchedule(null);
      } finally {
        setLoading(false);
      }
    };

    fetchNextSchedule();
  }, [facultyId]);

  const formatSchedule = (schedule: any) => {
    const startTime = schedule.startTime; // e.g. "08:00"
    const room = schedule.room;
    const scheduleDays = schedule.days;

    const now = new Date();

    const weekdays = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const shortDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

    let scheduleDayLabel = "";

    for (let i = 0; i < 7; i++) {
      const futureDate = new Date(now);
      futureDate.setDate(now.getDate() + i);
      const dayName = shortDays[futureDate.getDay()];

      if (scheduleDays[dayName]) {
        scheduleDayLabel = i === 0 ? "Today" : weekdays[futureDate.getDay()];
        break;
      }
    }

    const [hourStr, minuteStr] = startTime.split(":");
    const hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const formattedHour = hour % 12 === 0 ? 12 : hour % 12;

    const formattedTime = `${formattedHour
      .toString()
      .padStart(2, "0")}:${minuteStr} ${ampm}`;

    return `${scheduleDayLabel}, ${formattedTime} at ${room}`;
  };

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        if (!facultyId) return;
        
        console.log("Fetching today's schedules for facultyId:", facultyId);

        const response = await axios.get(
          `http://localhost:5000/api/auth/schedules/today/${facultyId}`
        );

        console.log("Raw API response:", response);
        console.log("Response data:", response.data);

        if (Array.isArray(response.data)) {
          console.log("Schedules array length:", response.data.length);
          setSchedules(response.data);
        } else {
          console.warn(
            "Expected an array but got:",
            typeof response.data,
            response.data
          );
          setSchedules([]); // Set empty array if not array
        }
      } catch (error) {
        console.error("Error fetching schedules for today:", error);
        setSchedules([]); // Set empty array on error
      }
    };

    fetchSchedules();
  }, [facultyId]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (!facultyId) return;
        
        const res = await axios.get(
          `http://localhost:5000/api/auth/logs/today/${facultyId}`
        );
        setToday(res.data.totalTodayHours || 0);
        setWeek(res.data.totalWeekHours || 0);
        setMonth(res.data.totalMonthHours || 0);
      } catch (error) {
        console.error("Failed to fetch stats", error);
        // Set default values on error
        setToday(0);
        setWeek(0);
        setMonth(0);
      }
    };

    fetchStats();
  }, [facultyId]);

  const formatTime = (timeStr: string) => {
    const [hour, minute] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return (
    <UserMain>
      <Box sx={{ color: "grey.900", p: { xs: 2, sm: 3, md: 1 } }}>
        <Box maxWidth="1200px" mx="auto">
          {/* Header */}
          <Box mb={6}>
            <Typography variant="h4" fontWeight={600}>
              Attendance
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              <span style={{ fontWeight: 400 }}>Dashboard</span> /{" "}
              <span style={{ fontStyle: "italic" }}>Attendance</span>
            </Typography>
          </Box>

          <Box
            display="grid"
            gridTemplateColumns={{ xs: "1fr", md: "repeat(3, 1fr)" }}
            gap={3}
            mb={6}
          >
            {/* Timesheet */}
            <Paper
              variant="outlined"
              sx={{
                p: 3,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={3}
              >
                <Typography
                  variant="subtitle2"
                  color="primary"
                  fontWeight={600}
                >
                  Timesheet
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {today}
                </Typography>
              </Box>

              <Box
                border="1px solid"
                borderColor="grey.300"
                borderRadius={1}
                p={2}
                mb={4}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight={600}
                  display="block"
                >
                  Your next schedule:
                </Typography>
                {loading ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Loading...
                  </Typography>
                ) : nextSchedule ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    mt={0.5}
                    display="block"
                  >
                    {formatSchedule(nextSchedule)}
                  </Typography>
                ) : (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    mt={0.5}
                    display="block"
                  >
                    No upcoming schedule today
                  </Typography>
                )}
              </Box>

              <Box display="flex" justifyContent="center" mb={4}>
                {/* Circular progress (custom SVG) */}
                <svg
                  width="96"
                  height="96"
                  viewBox="0 0 100 100"
                  role="img"
                  aria-label="Circular progress"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke={grey[300]}
                    strokeWidth="10"
                    fill="none"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke={blue[600]}
                    strokeWidth="10"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="282.6"
                    strokeDashoffset="182.6"
                    transform="rotate(-90 50 50)"
                  />
                  <text
                    x="50"
                    y="55"
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill="#111827"
                    fontFamily="Inter, sans-serif"
                  >
                    3.45 hrs
                  </text>
                </svg>
              </Box>

              <Box
                display="flex"
                justifyContent="space-between"
                fontSize={12}
                color="grey.700"
                fontWeight={600}
                mt={4}
                px={1}
              >
                <Box textAlign="center">
                  <Typography variant="body2" fontSize="0.75rem">
                    LATE
                  </Typography>
                  <Typography variant="body2" fontWeight={400}>
                    1.21 hrs
                  </Typography>
                </Box>
                <Box textAlign="center">
                  <Typography variant="body2" fontSize="0.75rem">
                    OVERTIME
                  </Typography>
                  <Typography variant="body2" fontWeight={400}>
                    3 hrs
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Statistics */}
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography
                variant="subtitle2"
                color="primary"
                fontWeight={600}
                mb={2}
              >
                Statistics
              </Typography>
              {[
                {
                  label: "Today",
                  value: totalHoursToday,
                  max: totalExpectedHoursToday,
                  color: green[400],
                },
                {
                  label: "This Week",
                  value: totalHoursWeek,
                  max: totalExpectedHoursWeek,
                  color: red[500],
                },
                {
                  label: "This Month",
                  value: totalHoursMonth,
                  max: totalExpectedHoursMonth,
                  color: yellow[700],
                },
                {
                  label: "No. of Absences this month",
                  value: 90,
                  max: 160,
                  color: blue[600],
                },
                {
                  label: "No. of Excuses this month",
                  value: 5,
                  max: 20,
                  color: yellow[500],
                },
              ].map(({ label, value, max, color }) => (
                <Box key={label} mb={2}>
                  <Typography
                    fontSize={12}
                    fontWeight={600}
                    color="grey.700"
                    mb={0.5}
                  >
                    {label}
                  </Typography>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    fontSize={12}
                    color="grey.500"
                    mb={0.5}
                  >
                    <span>{value}</span>
                    <span>/ {max} hrs</span>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(value / max) * 100}
                    sx={{
                      height: 8,
                      borderRadius: 5,
                      backgroundColor: grey[300],
                      "& .MuiLinearProgress-bar": { backgroundColor: color },
                    }}
                  />
                </Box>
              ))}
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
              <Box
                ml={1}
                pl={1}
                display="flex"
                flexDirection="column"
                gap={2}
                position="relative"
              >
                {logs.length === 0 ? (
                  <Box textAlign="center" py={2}>
                    <Typography variant="body2" color="text.secondary">
                      No activity recorded today
                    </Typography>
                  </Box>
                ) : (
                  logs.flatMap((log, index) => {
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
                        subIndex === arr.length - 1 && index === logs.length - 1;

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
                              {entry.label}
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

          {/* Attendance Table */}
          <Box
            display="grid"
            gridTemplateColumns={{ xs: "1fr", lg: "repeat(3, 1fr)" }}
            gap={3}
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
                Today's Schedule List
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: grey[100] }}>
                      <TableCell sx={{ fontWeight: 600 }}>S. No</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Start Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>End Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Room</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schedules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" color="text.secondary">
                            No schedules found for today
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...schedules]
                        .sort((a, b) => {
                          const [aHour, aMin] = a.startTime
                            .split(":")
                            .map(Number);
                          const [bHour, bMin] = b.startTime
                            .split(":")
                            .map(Number);
                          return aHour !== bHour ? aHour - bHour : aMin - bMin;
                        })
                        .map((schedule, idx) => (
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
                              {formatTime(schedule.startTime)}
                            </TableCell>
                            <TableCell>{formatTime(schedule.endTime)}</TableCell>
                            <TableCell>{schedule.room}</TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        </Box>
      </Box>
    </UserMain>
  );
};

export default FacultyDashboard;
