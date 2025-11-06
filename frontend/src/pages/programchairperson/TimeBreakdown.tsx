import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import AdminMain from "./AdminMain";
import axios from "axios";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import TuneIcon from "@mui/icons-material/Tune";
import RefreshIcon from "@mui/icons-material/Refresh";

interface TimeLog {
  _id: string;
  date: string;
  instructorName: string;
  courseCode: string;
  courseTitle: string;
  timeIn: string;
  timeOut: string;
  room: string;
  status: string;
  remarks: string;
}

const TimeBreakdown: React.FC = React.memo(() => {
  const { id } = useParams<{ id: string }>();
  const facultyId = id ?? "";

  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // ✅ Applied Filters (affect the table)
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedRoom, setSelectedRoom] = useState<string>("");

  // ✅ Temporary Filters (for modal only)
  const [tempYear, setTempYear] = useState<string>("");
  const [tempMonth, setTempMonth] = useState<string>("");
  const [tempDay, setTempDay] = useState<string>("");
  const [tempRoom, setTempRoom] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState<string>("");

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Extract fetchTimeLogs so it can be called manually for refresh
  const fetchTimeLogs = async () => {
    try {
      setLoading(true);
      const courseName = localStorage.getItem("course");
      console.log(`[TimeBreakdown] Fetching logs for course: "${courseName}"`);
      
      // If no course name, fetch all logs
      const requestBody = courseName ? { CourseName: courseName } : {};
      console.log(`[TimeBreakdown] Request body:`, requestBody);

      const response = await axios.post(
        "http://localhost:5000/api/auth/show-monthly-department-logs",
        requestBody
      );

      console.log(`[TimeBreakdown] ✅ Received ${response.data.count} logs`);
      console.log(`[TimeBreakdown] Raw response:`, response.data);

      if (!response.data.data || response.data.data.length === 0) {
        console.warn(`[TimeBreakdown] ⚠️ No logs found in response`);
        setLogs([]);
        return;
      }

      const formattedLogs: TimeLog[] = response.data.data.map((log: any, index: number) => {
        console.log(`[TimeBreakdown] Processing log ${index + 1}/${response.data.data.length}:`, {
          _id: log._id,
          course: log.course,
          date: log.date,
          timeIn: log.timeIn,
          timeOut: log.timeout,
          status: log.status,
          hasSchedule: !!log.schedule,
          scheduleType: typeof log.schedule,
          hasInstructor: log.schedule?.instructor ? 'yes' : 'no',
          instructorData: log.schedule?.instructor
        });
        
        // Get instructor name from schedule
        let instructorName = 'Unknown';
        if (log.schedule?.instructor) {
          const first = log.schedule.instructor.first_name || '';
          const middle = log.schedule.instructor.middle_name || '';
          const last = log.schedule.instructor.last_name || '';
          instructorName = `${first} ${middle} ${last}`.trim() || 'Unknown';
        }
        
        return {
          _id: log._id,
          date: log.date,
          instructorName: instructorName,
          courseCode: log.schedule?.courseCode || 'N/A',
          courseTitle: log.schedule?.courseTitle || 'N/A',
          timeIn: log.timeIn,
          timeOut: log.timeout,
          room: log.schedule?.room || 'N/A',
          status: log.status,
          remarks: log.remarks || '',
        };
      });

      console.log(`[TimeBreakdown] ✅ Successfully formatted ${formattedLogs.length} logs`);
      console.log(`[TimeBreakdown] Sample formatted log:`, formattedLogs[0]);
      setLogs(formattedLogs);
    } catch (error: any) {
      console.error("[TimeBreakdown] ❌ Error fetching time logs:", error);
      console.error("[TimeBreakdown] Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and auto-refresh every 30 seconds
  useEffect(() => {
    fetchTimeLogs();

    // Auto-refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      fetchTimeLogs();
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [facultyId]); // ✅ only runs when facultyId changes

  // ✅ Memoize unique years so reference doesn't change every render
  const uniqueYears = useMemo(() => {
    return Array.from(new Set(logs.map((log) => new Date(log.date).getFullYear().toString())));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const logDate = new Date(log.date);
      const year = logDate.getFullYear().toString();
      const month = (logDate.getMonth() + 1).toString().padStart(2, "0");
      const day = logDate.getDate().toString().padStart(2, "0");

      const matchesDate =
        (selectedYear ? year === selectedYear : true) &&
        (selectedMonth ? month === selectedMonth : true) &&
        (selectedDay ? day === selectedDay : true);

      const matchesRoom = selectedRoom ? log.room === selectedRoom : true;

      const matchesSearch = log.instructorName
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      return matchesDate && matchesRoom && matchesSearch;
    });
  }, [logs, selectedYear, selectedMonth, selectedDay, selectedRoom, searchQuery]);

  const paginatedLogs = useMemo(() => {
    return filteredLogs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredLogs, page, rowsPerPage]);

  return (
    <AdminMain>
      <Box p={3}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Faculty Time In/Out Breakdown
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          View detailed monthly records of time in, time out, and attendance status.
        </Typography>

        {/* ✅ Search Bar with Advanced Filters Button and Refresh */}
        <Grid container spacing={2} alignItems="center" justifyContent="center" mb={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by Instructor Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={fetchTimeLogs}
                      title="Refresh logs"
                      sx={{ mr: 1 }}
                    >
                      <RefreshIcon />
                    </IconButton>
                    <TuneIcon
                      onClick={() => {
                        // load current applied filters into temp state
                        setTempYear(selectedYear);
                        setTempMonth(selectedMonth);
                        setTempDay(selectedDay);
                        setTempRoom(selectedRoom);
                        setShowAdvanced(true);
                      }}
                      sx={{
                        cursor: "pointer",
                        color: "action.active",
                        "&:hover": { color: "primary.main" },
                      }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                backgroundColor: "#fff",
                borderRadius: 2,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                },
              }}
            />
          </Grid>
        </Grid>

        {/* ✅ Modern Modal for Advanced Filters */}
        <Dialog open={showAdvanced} onClose={() => setShowAdvanced(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Advanced Filters</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={tempYear}
                    label="Year"
                    onChange={(e) => setTempYear(e.target.value)}
                  >
                    <MenuItem value="">All</MenuItem>
                    {uniqueYears.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Month</InputLabel>
                  <Select
                    value={tempMonth}
                    label="Month"
                    onChange={(e) => setTempMonth(e.target.value)}
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
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Day</InputLabel>
                  <Select
                    value={tempDay}
                    label="Day"
                    onChange={(e) => setTempDay(e.target.value)}
                  >
                    <MenuItem value="">All</MenuItem>
                    {Array.from({ length: 31 }, (_, i) => {
                      const dayNum = (i + 1).toString().padStart(2, "0");
                      return (
                        <MenuItem key={dayNum} value={dayNum}>
                          {dayNum}
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Room</InputLabel>
                  <Select
                    value={tempRoom}
                    label="Room"
                    onChange={(e) => setTempRoom(e.target.value)}
                  >
                    <MenuItem value="">All</MenuItem>
                    {/* Replace with dynamic rooms from backend if available */}
                    <MenuItem value="Lab 1">Lab 1</MenuItem>
                    <MenuItem value="Lab 2">Lab 2</MenuItem>
                    <MenuItem value="Lab 3">Lab 3</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowAdvanced(false)} color="inherit">
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Apply temporary filters to real filters
                setSelectedYear(tempYear);
                setSelectedMonth(tempMonth);
                setSelectedDay(tempDay);
                setSelectedRoom(tempRoom);
                setShowAdvanced(false);
              }}
              variant="contained"
              color="primary"
            >
              Apply
            </Button>
          </DialogActions>
        </Dialog>

        {/* ✅ Table */}
        <TableContainer component={Paper} elevation={4} sx={{ borderRadius: 3 }}>
          <Box sx={{ maxHeight: 500, overflow: "auto" }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {[
                    "Date",
                    "Instructor Name",
                    "Course",
                    "Time In",
                    "Time Out",
                    "Room",
                    "Status",
                    "Remarks",
                  ].map((header) => (
                    <TableCell
                      key={header}
                      sx={{
                        position: "sticky",
                        top: 0,
                        backgroundColor: "#f5f5f5",
                        color: "#333",
                        fontWeight: "bold",
                        fontSize: "0.9rem",
                        textTransform: "uppercase",
                      }}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={30} />
                      <Typography mt={2} variant="body2" color="text.secondary">
                        Loading time logs...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      No time logs available.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLogs.map((log, index) => (
                    <TableRow
                      key={log._id}
                      hover
                      sx={{
                        backgroundColor: index % 2 === 0 ? "#fafafa" : "white",
                        "&:hover": { backgroundColor: "#f0f4ff" },
                      }}
                    >
                      <TableCell>
                        {new Date(log.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell>{log.instructorName}</TableCell>
                      <TableCell>
                        {log.courseCode} - {log.courseTitle}
                      </TableCell>
                      <TableCell>{log.timeIn}</TableCell>
                      <TableCell>{log.timeOut || "-"}</TableCell>
                      <TableCell>{log.room}</TableCell>
                      <TableCell>
                        {(() => {
                          const status = log.status?.toLowerCase();
                          let chipColor:
                            | "success"
                            | "warning"
                            | "error"
                            | "info"
                            | "secondary"
                            | "default" = "default";

                          if (status === "present") chipColor = "success";
                          else if (status === "late") chipColor = "warning";
                          else if (status === "absent") chipColor = "error";
                          else if (status === "left early") chipColor = "secondary";
                          else if (status === "returned") chipColor = "info";

                          return (
                            <Chip
                              label={log.status}
                              color={chipColor}
                              variant="filled"
                              sx={{
                                fontWeight: "bold",
                                textTransform: "capitalize",
                                borderRadius: "8px",
                                minWidth: 90,
                                justifyContent: "center",
                              }}
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell>{log.remarks || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>

          <TablePagination
            component="div"
            count={filteredLogs.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{
              px: 2,
              borderTop: "1px solid #e0e0e0",
              backgroundColor: "#fafafa",
            }}
          />
        </TableContainer>
      </Box>
    </AdminMain>
  );
});

TimeBreakdown.displayName = 'TimeBreakdown';

export default TimeBreakdown;
