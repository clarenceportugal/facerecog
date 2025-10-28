//components/Info Modal.tsx
import React, { useEffect, useState } from "react";
import {
  Modal,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  CircularProgress,
  IconButton,
  Avatar,
  Tooltip,
  TextField,
  MenuItem,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import "./CustomHeatmap.css";
import axios from "axios";
import Swal from "sweetalert2";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import weekday from "dayjs/plugin/weekday";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
dayjs.extend(weekday);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);
import AddManualScheduleModal from "./AddManualScheduleModal";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  faculty: any;
}

interface Schedule {
  courseCode: string;
  courseTitle: string;
  displaySection: string;
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    [key: string]: boolean;
  };
  startTime: string;
  endTime: string;
  room: string;
  [key: string]: any;
}

const InfoModal: React.FC<ModalProps> = ({ open, onClose, faculty }) => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isHeatmapMaximized, setIsHeatmapMaximized] = useState(false);
  const today = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [openAddManualModal, setOpenAddManualModal] = useState(false);

  // NEW: semester dropdown options and selected state
  const semesterOptions = [
    "1st Semester, AY 2024-2025",
    "2nd Semester, AY 2024-2025",
    "1st Semester, AY 2025-2026",
    "2nd Semester, AY 2025-2026",
    "1st Semester, AY 2026-2027",
    "2nd Semester, AY 2026-2027",
  ];
  const [selectedSemester, setSelectedSemester] = useState<string>(
    "1st Semester, AY 2025-2026"
  );

  // Reusable fetchSchedules so we can call it after uploads and modal close
  const fetchSchedules = async () => {
    if (!faculty?._id) return;
    setIsLoading(true);
    try {
      // include semester as a query param so backend can filter if supported
      const response = await axios.get(
        "http://localhost:5000/api/auth/schedules-faculty",
        {
          params: { facultyId: faculty._id, semester: selectedSemester },
        }
      );
      console.log("Received schedule data:", response.data);
      setSchedules(response.data);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddManual = () => setOpenAddManualModal(true);
  // Close manual modal and refresh schedules immediately
  const handleCloseAddManual = async () => {
    setOpenAddManualModal(false);
    await fetchSchedules();
  };

  const handleAddSchedule = async () => {
    const { value: file } = await Swal.fire({
      title: "Upload Schedule Document",
      input: "file",
      inputAttributes: {
        accept: ".doc,.docx",
        "aria-label": "Upload your teaching load document",
      },
      showCancelButton: true,
      confirmButtonText: "Upload",
      preConfirm: (file) => {
        if (!file) {
          Swal.showValidationMessage("You need to select a file");
        }
        return file;
      },
    });

    if (!file) return;

    const formData = new FormData();
    formData.append("scheduleDocument", file);

    // Start uploading indicator
    setUploading(true);

    try {
      const { data } = await axios.post(
        "http://localhost:5000/api/auth/uploadScheduleDocument",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const scheduleData: Schedule[] = data.data;
      const semesterStartDate = data.semesterStartDate;
      const semesterEndDate = data.semesterEndDate;
      const academicYear = data.academicYear;
      const semester = data.semester;
      const instructorName = data.instructorName;
      const existing = data.existing;
      const existingCount = data.existingCount || 0;

      // Build preview table HTML
      let tableHtml = `
      <table style="width:100%; border: 1px solid #ddd; border-collapse: collapse;">
        <thead>
          <tr>
            <th>Course Code</th>
            <th>Course Title</th>
            <th>Section</th>
            <th>Days</th>
            <th>Time</th>
            <th>Room</th>
          </tr>
        </thead>
        <tbody>
    `;

      scheduleData.forEach((schedule: Schedule) => {
        const days = Object.keys(schedule.days || {})
          .filter((day) => (schedule.days as any)[day])
          .join(", ");

        tableHtml += `
        <tr>
          <td>${schedule.courseCode}</td>
          <td>${schedule.courseTitle}</td>
          <td>${schedule.displaySection}</td>
          <td>${days}</td>
          <td>${schedule.startTime} – ${schedule.endTime}</td>
          <td>${schedule.room}</td>
        </tr>
      `;
      });

      tableHtml += `</tbody></table>`;

      // If existing schedules exist for that semester, prompt to replace or cancel
      if (existing) {
        // Prefer the selectedSemester label (if you have it) else fall back to parsed semester
        const semesterLabel =
          typeof selectedSemester === "string" && selectedSemester
            ? selectedSemester
            : `${semester}, AY ${academicYear}`;

        const replaceResult = await Swal.fire({
          title: "Existing schedules detected",
          html: `
          <p>There are <strong>${existingCount}</strong> schedules already stored for <strong>${semesterLabel}</strong>.</p>
          <p style="color: #b71c1c;"><strong>Warning:</strong> Uploading now will <em>overwrite</em> those schedules for this semester.</p>
          <p>Are you sure you want to overwrite the existing schedules for <strong>${semesterLabel}</strong>?</p>
          <div style="margin-top:10px">
            <strong>Instructor:</strong> ${instructorName}<br/>
            <strong>Semester & AY (parsed):</strong> ${semester}, AY ${academicYear}
          </div>
          <hr />
          ${tableHtml}
        `,
          showCancelButton: true,
          showDenyButton: true,
          denyButtonText: "Cancel Upload",
          confirmButtonText: "Overwrite Existing",
          width: 900,
          scrollbarPadding: false,
        });

        if (replaceResult.isDenied || replaceResult.isDismissed) {
          // user cancelled -> stop uploading indicator and return
          setUploading(false);
          return;
        }

        if (replaceResult.isConfirmed) {
          // Proceed with replace: send replace flag and semester dates
          await axios.post("http://localhost:5000/api/auth/confirmSchedules", {
            schedules: scheduleData,
            replace: true,
            semesterStartDate,
            semesterEndDate,
          });

          await Swal.fire({
            icon: "success",
            title: "Schedules Replaced!",
            text: `Existing schedules for ${semesterLabel} were replaced with the uploaded ones.`,
            timer: 2500, // ⏰ auto-close after 2.5 seconds
            showConfirmButton: false, // hide the OK button
          });

          // REFRESH schedules immediately
          await fetchSchedules();

          // Make sure uploading indicator is cleared (although finally also clears it)
          setUploading(false);
          return;
        }
      } else {
        // No existing schedules: show confirm preview (original flow)
        const semesterLabel =
          typeof selectedSemester === "string" && selectedSemester
            ? selectedSemester
            : `${semester}, AY ${academicYear}`;

        const confirmResult = await Swal.fire({
          title: "Confirm upload schedule?",
          html: `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <p><strong>Instructor:</strong> ${instructorName}</p>
            <p><strong>Semester & AY:</strong> ${semesterLabel}</p>
          </div>
          ${tableHtml}
        `,
          showCancelButton: true,
          confirmButtonText: "Confirm Upload",
          width: 800,
          scrollbarPadding: false,
        });

        if (confirmResult.isConfirmed) {
          await axios.post("http://localhost:5000/api/auth/confirmSchedules", {
            schedules: scheduleData,
            replace: false,
            semesterStartDate,
            semesterEndDate,
          });

          await Swal.fire({
            icon: "success",
            title: "Schedules Uploaded!",
            text: "The schedules have been successfully uploaded to the database.",
          });

          // REFRESH schedules immediately
          await fetchSchedules();
        } else {
          // cancelled preview
          setUploading(false);
          return;
        }
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: error.response?.data?.message || "Something went wrong.",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: "An unknown error occurred.",
        });
      }
    } finally {
      // Stop uploading indicator no matter what happened
      setUploading(false);
    }
  };

  // initial fetch for schedules — re-run when faculty or selectedSemester changes
  useEffect(() => {
    fetchSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faculty?._id, selectedSemester]);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!faculty?._id) return;

      try {
        const response = await axios.get(
          "http://localhost:5000/api/auth/logs/faculty-today",
          {
            params: { facultyId: faculty._id },
          }
        );
        console.log("Received logs:", response.data);
        setLogs(response.data);
      } catch (error) {
        console.error("Error fetching logs:", error);
      }
    };

    fetchLogs();
  }, [faculty?._id]);

  // When heatmap is maximized, disable body scroll and bind Esc key to restore
  useEffect(() => {
    if (isHeatmapMaximized) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsHeatmapMaximized(false);
      };
      window.addEventListener("keydown", onKey);

      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener("keydown", onKey);
      };
    }
    // no cleanup necessary when not maximized
    return;
  }, [isHeatmapMaximized]);

  if (!faculty) return null;

  const processLogsForHeatmap = () => {
    const logCounts: { [key: string]: number } = {};

    logs.forEach((log: any) => {
      const date = log.date;
      if (logCounts[date]) {
        logCounts[date] += 1;
      } else {
        logCounts[date] = 1;
      }
    });

    return Object.keys(logCounts).map((date) => ({
      date,
      count: logCounts[date],
    }));
  };

  const values = processLogsForHeatmap();

  const formatTime = (time24: string) => {
    if (!time24) return "";

    const [hourStr, minuteStr] = time24.split(":");
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    hour = hour % 12 || 12;

    return `${hour}:${minute.toString().padStart(2, "0")}`;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const facultyId = faculty._id;

    if (!file || !facultyId) return;

    const formData = new FormData();
    formData.append("image", file);
    formData.append("facultyId", facultyId);

    try {
      const res = await axios.post(
        "https://eduvision-dura.onrender.com/api/auth/upload-faculty-profile-photo",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (res.status === 200) {
        Swal.fire({
          icon: "success",
          title: "Photo Uploaded!",
          text: "Faculty profile photo has been updated.",
        });

        // Optional: Refresh the image or trigger a parent re-fetch
      }
    } catch (error) {
      console.error("Photo upload error:", error);
      Swal.fire({
        icon: "error",
        title: "Upload Failed",
        text: "There was an error uploading the photo.",
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      BackdropProps={{
        style: {
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          bgcolor: "#F8E5EE",
          boxShadow: 10,
          p: 4,
          maxWidth: 1100,
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          color: "#211103",
        }}
      >
        <Box sx={{ position: "relative", mb: 2 }}>
          {/* Centered Faculty Info */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Typography variant="h5">
              Faculty Information of{" "}
              <span style={{ fontWeight: "bold", color: "#7B0D1E" }}>
                {`${faculty.last_name}, ${faculty.first_name}`}
              </span>
            </Typography>
          </Box>

          <Box
            sx={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <input
              type="file"
              accept="image/*"
              id="upload-photo"
              style={{ display: "none" }}
              onChange={handlePhotoUpload}
            />

            <label htmlFor="upload-photo">
              <IconButton component="span">
                <Avatar src={faculty.profilePhotoUrl || ""}>
                  {!faculty.profilePhotoUrl && <PersonIcon />}
                </Avatar>
              </IconButton>
            </label>
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            gap: 4,
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          {/* Left Column: Faculty Info and Heatmap */}
          <Box
            sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}
          >
            {/* REPLACED heading with Semester dropdown */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <TextField
                select
                size="small"
                label="Semester"
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                sx={{ minWidth: 260 }}
                SelectProps={{ IconComponent: ArrowDropDownIcon }}
              >
                {semesterOptions.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </TextField>

              <Typography variant="subtitle2" color="text.secondary">
                (select semester to view schedules)
              </Typography>
            </Box>

            {/* Faculty Information Table */}
            <Box
              component={Paper}
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                position: "relative",
                backgroundColor: "#FFF",
                border: "1px solid #3D1308",
                borderRadius: 2,
              }}
            >
              <IconButton
                aria-label="edit faculty info"
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  color: "#7B0D1E",
                }}
                onClick={() => {
                  console.log("Edit clicked");
                }}
              >
                <EditIcon />
              </IconButton>

              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Highest Educational Attainment:
                </Typography>
                <Typography variant="body1">
                  {faculty.highestEducationalAttainment}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Academic Rank:
                </Typography>
                <Typography variant="body1">{faculty.academicRank}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Status of Appointment:
                </Typography>
                <Typography variant="body1">
                  {faculty.statusOfAppointment}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  No. of Preparations:
                </Typography>
                <Typography variant="body1">{faculty.numberOfPrep}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Total Teaching Load:
                </Typography>
                <Typography variant="body1">
                  {faculty.totalTeachingLoad}
                </Typography>
              </Box>
            </Box>

            {/* Faculty Activity Heatmap */}
            {/* wrapper Box: changes size/position when maximized */}
            <Box
              sx={
                isHeatmapMaximized
                  ? {
                      position: "fixed",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      zIndex: 1400,
                      width: "90vw",
                      height: "80vh",
                      p: 3,
                      borderRadius: 2,
                      backgroundColor: "#FFF",
                      border: "1px solid #3D1308",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      boxShadow: 20,
                    }
                  : {
                      p: 2,
                      border: "1px solid #3D1308",
                      borderRadius: 2,
                      backgroundColor: "#FFF",
                      flexShrink: 0,
                      height: "auto",
                      textAlign: "center",
                      position: "relative",
                    }
              }
            >
              {/* maximize / minimize button at top-right */}
              <Box
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  display: "flex",
                  gap: 1,
                }}
              >
                <Tooltip
                  title={isHeatmapMaximized ? "Minimize" : "Maximize"}
                  arrow
                >
                  <IconButton
                    size="small"
                    onClick={() => setIsHeatmapMaximized((s) => !s)}
                    aria-label={
                      isHeatmapMaximized
                        ? "minimize heatmap"
                        : "maximize heatmap"
                    }
                  >
                    {isHeatmapMaximized ? (
                      <FullscreenExitIcon />
                    ) : (
                      <FullscreenIcon />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>

              <Typography variant="h6" sx={{ textAlign: "center" }}>
                Faculty Activity
              </Typography>

              <Box
                sx={
                  isHeatmapMaximized
                    ? {
                        flex: 1,
                        overflow: "auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }
                    : { width: "100%" }
                }
              >
                <CalendarHeatmap
                  startDate={startDate}
                  endDate={endDate}
                  values={values}
                  classForValue={(value) => {
                    if (!value || value.count === 0) {
                      return "color-empty";
                    }
                    return `color-github-${value.count}`;
                  }}
                  tooltipDataAttrs={(value) => {
                    if (value && value.date) {
                      return {
                        "data-tip": `${value.date}: ${value.count} activities`,
                      } as unknown as CalendarHeatmap.TooltipDataAttrs;
                    }
                    return {} as CalendarHeatmap.TooltipDataAttrs;
                  }}
                  showWeekdayLabels
                />
              </Box>
            </Box>
          </Box>

          {/* Right Column: Faculty Schedules */}
          <Box
            sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
                Teaching Load
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Tooltip title="Upload schedule manually" arrow>
                  <span>
                    <IconButton
                      sx={{ color: "#9F2042" }}
                      onClick={handleOpenAddManual}
                      disabled={uploading}
                    >
                      <AddCircleOutlineIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip
                  title={uploading ? "Uploading..." : "Upload schedule by docx"}
                  arrow
                >
                  <span>
                    <IconButton
                      sx={{ color: "#9F2042" }}
                      onClick={handleAddSchedule}
                      disabled={uploading}
                      aria-label="upload schedule"
                    >
                      {uploading ? (
                        <CircularProgress size={20} />
                      ) : (
                        <FileUploadIcon />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>

            {/* Faculty Schedules Table */}
            <TableContainer
              component={Paper}
              sx={{ maxHeight: 440, overflowY: "auto" }}
            >
              <Table size="small" aria-label="faculty schedules table">
                <TableHead>
                  <TableRow>
                    {["Course Code", "Days", "Time", "Section", "Room"].map(
                      (label) => (
                        <TableCell
                          key={label}
                          sx={{
                            fontWeight: "bold",
                            position: "sticky",
                            top: 0,
                            backgroundColor: "background.paper",
                            zIndex: 10,
                          }}
                        >
                          {label}
                        </TableCell>
                      )
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : schedules.length > 0 ? (
                    (
                      schedules as Array<{
                        startTime: string;
                        endTime: string;
                        [key: string]: any;
                      }>
                    )
                      .slice()
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map((schedule) => (
                        <TableRow key={schedule._id}>
                          <TableCell>{schedule.courseCode}</TableCell>
                          <TableCell>
                            {(() => {
                              const dayAbbreviations: {
                                [key: string]: string;
                              } = {
                                sun: "Su",
                                mon: "M",
                                tue: "T",
                                wed: "W",
                                thu: "Th",
                                fri: "F",
                                sat: "S",
                              };

                              return Object.entries(schedule.days || {})
                                .filter(([_, isActive]) => isActive)
                                .map(
                                  ([day]) =>
                                    dayAbbreviations[day.toLowerCase()] || ""
                                )
                                .join("");
                            })()}
                          </TableCell>
                          <TableCell>
                            {formatTime(schedule.startTime)} -{" "}
                            {formatTime(schedule.endTime)}
                          </TableCell>
                          <TableCell>
                            {schedule.section?.course} -{" "}
                            {schedule.section?.section}
                            {schedule.section?.block}
                          </TableCell>
                          <TableCell>{schedule.room}</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No schedules yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>

        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            mt: 2,
            backgroundColor: "#7B0D1E",
            "&:hover": { backgroundColor: "#9F2042" },
          }}
          fullWidth
        >
          Close
        </Button>

        <AddManualScheduleModal
          open={openAddManualModal}
          onClose={handleCloseAddManual}
          faculty={faculty}
        />
      </Box>
    </Modal>
  );
};

export default InfoModal;
