/**
 * ============================================================
 * validation.js — Form Input Validations
 * ============================================================
 */

import { showToast } from "./common.js";
import { getDropdownSelected } from "./dropdown.js";

/**
 * Validates the fields for the New Job Insert card.
 * @returns {boolean} True if all validations pass.
 */
export function validateJob() {
  const icSelected = getDropdownSelected("job-ic").length > 0;
  const verticalSelected = getDropdownSelected("job-vertical").length > 0;
  const jobCode = document.getElementById("job-code").value.trim();
  const jobName = document.getElementById("job-name").value.trim();

  if (!icSelected) {
    showToast("Job IC selection is required.", "error");
    return false;
  }
  if (!verticalSelected) {
    showToast("Job Vertical selection is required.", "error");
    return false;
  }
  if (!jobCode) {
    showToast("Job Code is required.", "error");
    return false;
  }
  const codeNum = Number(jobCode);
  if (isNaN(codeNum) || !Number.isInteger(codeNum) || codeNum <= 0) {
    showToast("Job Code must be a positive integer.", "error");
    return false;
  }
  if (!jobName) {
    showToast("Job Name is required.", "error");
    return false;
  }
  return true;
}

/**
 * Validates the fields for the New User Insert card.
 * @returns {boolean} True if validations pass.
 */
export function validateUser() {
  const icSelected = getDropdownSelected("user-ic").length > 0;
  const email = document.getElementById("user-email").value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!icSelected) {
    showToast("User IC selection is required.", "error");
    return false;
  }
  if (!email) {
    showToast("User Email is required.", "error");
    return false;
  }
  if (!emailRegex.test(email)) {
    showToast("Invalid User Email format.", "error");
    return false;
  }
  return true;
}

/**
 * Validates the fields for the File Type Insert card.
 * @returns {boolean} True if validations pass.
 */
export function validateFileType() {
  const icSelected = getDropdownSelected("filetype-ic").length > 0;
  const fileType = document.getElementById("file-type").value.trim();

  if (!icSelected) {
    showToast("File Type IC selection is required.", "error");
    return false;
  }
  if (!fileType) {
    showToast("File Type name is required.", "error");
    return false;
  }
  return true;
}

/**
 * Validates the fields for the New Vertical Insert card.
 * @returns {boolean} True if validations pass.
 */
export function validateVertical() {
  const icSelected = getDropdownSelected("vertical-ic").length > 0;
  const verticalName = document.getElementById("vertical-name").value.trim();

  if (!icSelected) {
    showToast("Vertical IC selection is required.", "error");
    return false;
  }
  if (!verticalName) {
    showToast("Vertical Name is required.", "error");
    return false;
  }
  return true;
}
