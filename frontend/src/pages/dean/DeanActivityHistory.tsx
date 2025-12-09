import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import GroupIcon from "@mui/icons-material/Group";
import BookIcon from "@mui/icons-material/Book";
import FaceIcon from "@mui/icons-material/Face";
import AssessmentIcon from "@mui/icons-material/Assessment";
import axios from "axios";
import { API_BASE_URL } from "../../utils/api";

interface SystemActivity {
  _id: string;
  type: 'accept_faculty' | 'create_account' | 'delete_account' | 'add_schedule' | 'delete_schedule' | 'add_section_block' | 'delete_section_block' | 'add_subject' | 'delete_subject' | 'register_face' | 'generate_report';
  action: string;
  performedBy: string;
  targetUser?: string;
  targetName?: string;
  details?: string;
  timestamp: string;
  date: string;
}

const DeanActivityHistory: React.FC = () => {
  const [activities, setActivities] = useState<SystemActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filters
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const currentUser = localStorage.getItem("userName") || "Unknown User";
  const currentUserId = localStorage.getItem("userId") || "";

  const fetchSystemActivities = async () => {
    try {
      setLoading(true);
      const courseName = localStorage.getItem("course") || "";
      const userRole = localStorage.getItem("role") || "dean";
      
      // Use the new backend endpoint that fetches activities filtered by role
      const response = await axios.get(
        `${API_BASE_URL}/api/auth/system-activities`,
        { params: { courseName, userRole } }
      );

      if (response.data.success && Array.isArray(response.data.activities)) {
        const activities = response.data.activities.map((activity: any) => ({
          _id: activity._id,
          type: activity.type,
          action: activity.action,
          performedBy: activity.performedBy || currentUser,
          targetUser: activity.targetUser,
          targetName: activity.targetName,
          details: activity.details,
          timestamp: activity.timestamp,
          date: activity.date,
        }));
        
        setActivities(activities);
        console.log(`[DeanActivityHistory] ✅ Loaded ${activities.length} system activities from backend`);
        console.log(`[DeanActivityHistory] Breakdown:`, {
          accept_faculty: activities.filter((a: SystemActivity) => a.type === 'accept_faculty').length,
          create_account: activities.filter((a: SystemActivity) => a.type === 'create_account').length,
          add_schedule: activities.filter((a: SystemActivity) => a.type === 'add_schedule').length,
          add_section_block: activities.filter((a: SystemActivity) => a.type === 'add_section_block').length,
          add_subject: activities.filter((a: SystemActivity) => a.type === 'add_subject').length,
          register_face: activities.filter((a: SystemActivity) => a.type === 'register_face').length,
          generate_report: activities.filter((a: SystemActivity) => a.type === 'generate_report').length,
        });
      } else {
        console.error("[DeanActivityHistory] Invalid response format:", response.data);
        setActivities([]);
      }
    } catch (error: any) {
      console.error("[DeanActivityHistory] ❌ Error fetching system activities:", error);
      console.error("[DeanActivityHistory] Error details:", error.response?.data || error.message);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemActivities();
  }, []);

  // Memoize unique years
  const uniqueYears = useMemo(() => {
    return Array.from(new Set(activities.map((activity) => new Date(activity.date).getFullYear().toString())));
  }, [activities]);

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      const activityDate = new Date(activity.date);
      const year = activityDate.getFullYear().toString();
      const month = (activityDate.getMonth() + 1).toString().padStart(2, "0");
      const day = activityDate.getDate().toString().padStart(2, "0");

      const matchesDate =
        (selectedYear ? year === selectedYear : true) &&
        (selectedMonth ? month === selectedMonth : true) &&
        (selectedDay ? day === selectedDay : true);

      const matchesType = selectedType ? activity.type === selectedType : true;

      const matchesSearch = 
        activity.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.performedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (activity.targetName && activity.targetName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (activity.details && activity.details.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesDate && matchesType && matchesSearch;
    });
  }, [activities, selectedYear, selectedMonth, selectedDay, selectedType, searchQuery]);

  const paginatedActivities = useMemo(() => {
    return filteredActivities.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredActivities, page, rowsPerPage]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'accept_faculty':
        return <CheckCircleIcon sx={{ color: '#4caf50' }} />;
      case 'create_account':
        return <PersonAddIcon sx={{ color: '#2196f3' }} />;
      case 'delete_account':
        return <PersonAddIcon sx={{ color: '#f44336', transform: 'rotate(45deg)' }} />;
      case 'add_schedule':
        return <ScheduleIcon sx={{ color: '#ff9800' }} />;
      case 'delete_schedule':
        return <ScheduleIcon sx={{ color: '#f44336' }} />;
      case 'add_section_block':
        return <GroupIcon sx={{ color: '#00bcd4' }} />;
      case 'delete_section_block':
        return <GroupIcon sx={{ color: '#f44336' }} />;
      case 'add_subject':
        return <BookIcon sx={{ color: '#795548' }} />;
      case 'delete_subject':
        return <BookIcon sx={{ color: '#f44336' }} />;
      case 'register_face':
        return <FaceIcon sx={{ color: '#9c27b0' }} />;
      case 'generate_report':
        return <AssessmentIcon sx={{ color: '#f44336' }} />;
      default:
        return <HistoryIcon sx={{ color: '#757575' }} />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'accept_faculty':
        return 'success';
      case 'create_account':
        return 'info';
      case 'delete_account':
        return 'error';
      case 'add_schedule':
        return 'warning';
      case 'delete_schedule':
        return 'error';
      case 'add_section_block':
        return 'info';
      case 'delete_section_block':
        return 'error';
      case 'add_subject':
        return 'default';
      case 'delete_subject':
        return 'error';
      case 'register_face':
        return 'secondary';
      case 'generate_report':
        return 'error';
      default:
        return 'default';
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'accept_faculty':
        return 'Accept Faculty';
      case 'create_account':
        return 'Create Account';
      case 'delete_account':
        return 'Delete Account';
      case 'add_schedule':
        return 'Add Schedule';
      case 'delete_schedule':
        return 'Delete Schedule';
      case 'add_section_block':
        return 'Add Section/Block';
      case 'delete_section_block':
        return 'Delete Section/Block';
      case 'add_subject':
        return 'Add Subject';
      case 'delete_subject':
        return 'Delete Subject';
      case 'register_face':
        return 'Register Face';
      case 'generate_report':
        return 'Generate Report';
      default:
        return 'Activity';
    }
  };

  return (
    <Box 
      display="flex" 
      flexDirection="column" 
      gap={3}
      sx={{
        width: "100%",
        maxWidth: "100%",
        overflow: "visible",
        pt: 1,
      }}
    >
      {/* Header Section */}
      <Box
        sx={{
          p: 3,
          backgroundColor: "#fff",
          borderRadius: 3,
          boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
          width: "100%",
          mb: 2,
        }}
      >
        <Box 
          display="flex" 
          alignItems="center" 
          gap={2} 
          mb={3}
          sx={{
            flexWrap: { xs: "wrap", sm: "nowrap" },
            width: "100%",
          }}
        >
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: "primary.main",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 56,
              height: 56,
              flexShrink: 0,
            }}
          >
            <HistoryIcon sx={{ fontSize: 32 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography 
              variant="h4" 
              fontWeight={700} 
              color="#1a1a1a" 
              gutterBottom
              sx={{
                fontSize: { xs: "1.5rem", sm: "2rem" },
                lineHeight: 1.3,
                mb: 1,
              }}
            >
              Activity History
            </Typography>
            <Typography 
              variant="body2" 
              color="text.secondary"
              sx={{
                fontSize: { xs: "0.75rem", sm: "0.875rem" },
                lineHeight: 1.5,
              }}
            >
              View all system activities: accepted faculty, created accounts, added schedules, face registrations, and reports
            </Typography>
          </Box>
        </Box>

        {/* Search and Filters */}
        <Grid container spacing={2} alignItems="center" sx={{ width: "100%" }}>
          <Grid item xs={12} md={5} lg={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by action, user, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{
                backgroundColor: "#f8f9fa",
                borderRadius: 2,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                },
              }}
            />
          </Grid>
          <Grid item xs={6} sm={4} md={2} lg={2}>
            <FormControl fullWidth size="small">
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
          </Grid>
          <Grid item xs={6} sm={4} md={2} lg={2}>
            <FormControl fullWidth size="small">
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
          </Grid>
          <Grid item xs={6} sm={4} md={2} lg={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Day</InputLabel>
              <Select
                value={selectedDay}
                label="Day"
                onChange={(e) => setSelectedDay(e.target.value)}
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
          <Grid item xs={6} sm={4} md={2} lg={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Activity Type</InputLabel>
              <Select
                value={selectedType}
                label="Activity Type"
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="accept_faculty">Accept Faculty</MenuItem>
                <MenuItem value="create_account">Create Account</MenuItem>
                <MenuItem value="add_schedule">Add Schedule</MenuItem>
                <MenuItem value="add_section_block">Add Section/Block</MenuItem>
                <MenuItem value="delete_section_block">Delete Section/Block</MenuItem>
                <MenuItem value="add_subject">Add Subject</MenuItem>
                <MenuItem value="delete_subject">Delete Subject</MenuItem>
                <MenuItem value="register_face">Register Face</MenuItem>
                <MenuItem value="generate_report">Generate Report</MenuItem>
                <MenuItem value="delete_account">Delete Account</MenuItem>
                <MenuItem value="delete_schedule">Delete Schedule</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Box>

      {/* Table */}
      <TableContainer
        component={Paper}
        elevation={4}
        sx={{
          borderRadius: 3,
          boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <Box sx={{ 
          maxHeight: "calc(100vh - 400px)",
          minHeight: 400,
          overflow: "auto",
          width: "100%",
        }}>
          <Table stickyHeader size="small" sx={{ width: "100%" }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f1f3f4" }}>
                {[
                  "Date & Time",
                  "Activity Type",
                  "Action",
                  "Performed By",
                  "Target User",
                  "Details",
                ].map((header) => (
                  <TableCell
                    key={header}
                    sx={{
                      position: "sticky",
                      top: 0,
                      backgroundColor: "#f1f3f4",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      color: "#333",
                      zIndex: 10,
                      whiteSpace: "nowrap",
                      minWidth: header === "Details" ? 200 : header === "Action" ? 150 : 120,
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
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={30} />
                    <Typography mt={2} variant="body2" color="text.secondary">
                      Loading system activities...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredActivities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <HistoryIcon sx={{ fontSize: 48, color: "text.secondary", opacity: 0.5, mb: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      No system activities found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedActivities.map((activity, index) => (
                  <TableRow
                    key={activity._id}
                    hover
                    sx={{
                      backgroundColor: index % 2 === 0 ? "#fafafa" : "white",
                      transition: "background-color 0.2s ease",
                      "&:hover": { backgroundColor: "#f1f3f4" },
                    }}
                  >
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {new Date(activity.timestamp).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(activity.timestamp).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getActivityIcon(activity.type)}
                        <Chip
                          label={getActivityLabel(activity.type)}
                          color={getActivityColor(activity.type) as any}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            borderRadius: "8px",
                          }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {activity.action}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Typography variant="body2">
                        {activity.performedBy}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {activity.targetName || activity.targetUser || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 200, maxWidth: 300 }}>
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={activity.details || ""}
                      >
                        {activity.details || "-"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>

        <TablePagination
          component="div"
          count={filteredActivities.length}
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
  );
};

export default DeanActivityHistory;
