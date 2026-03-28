# IlmTrack — Manual Test Cases

---

## 1. Authentication and Class creation

### 1.1 Sign Up — Teacher
- Sign up with a new email, select **Teacher** role
- Don't verify yet. Attempt login without verifying email — blocked with message
- Verify email sent
- Resend verify email
- Complete verification
- Verify admin received an email about teacher signup after verification
- Confirm redirected to teacher home after login

### 1.2 Create Class
- Attempt to create with empty name — validation error shown
- Create a new class — appears in class list

### 1.3 Edit Class
- Rename a class — change saved and reflected in list
- Add a student and random parent email
- Delete a class — removed from list; all students in it should also be removed

### 1.4 Sign Up — Parent
- As admin send out an invite to a parent with a child
- Sign up the parent with an email that has a pending invite
- Confirm linked student(s) appear automatically on home screen
- Sign up with a fresh email (no invite) — confirm empty state shown

### 1.3 Login - Admin and Parent
- Login with valid credentials — correct dashboard shown for role
- Login with wrong password — error shown
- Use "Forgot Password" — reset email received, can set new password

---

## 2. Teacher — Classes

### 2.1 Invite Another Teacher to Class
- Add another teacher's email to the class admin list
- That teacher receives an invite email
- Teacher accepts the invite and can see the class and its students
- Remove that teacher from class — they lose access to the class data

---

## 3. Teacher — Students

### 3.1 Add Student
- Add a student with first name, last name, and at least one parent email
- Student appears in class list with correct name
- Invite email sent to parent

### 3.2 Edit Student
- Edit a student's name — change reflected in list and detail view
- Add a second parent — invite sent to new parent

### 3.3 Delete Student
- Delete a student — removed from class list
- Confirm homework and attendance records for that student are also cleaned up

### 3.4 Search Students
- Search by first/last name — correct students returned
- Search with no match — empty state shown

### 3.5 Test homework
- Create a homework and attendance with main teacher and ensure co-teacher can evaluate that homework and view attendance
- Create a homework and attendance with co teacher and ensure the main teacher can evaluate that homework and view attendance

---

## 4. Teacher — Homework

### 4.1 Assign Homework
- Assign homework to a student with a title, notes and description
- Appears in student's homework list
- Parent receives push notification (if token registered)

### 4.2 Evaluate Homework
- Open homework item and set an evaluation (e.g. Excellent, Good, Needs Work)
- Evaluation label shown on homework card

### 4.3 Homework List
- Homework sorted by date (most recent first)
- Load more pagination works — older records load on scroll/tap

### 4.4 Home Screen — Quick Actions
- Today's homework count shown for each class
- Mark attendance directly from home screen

---

## 5. Teacher — Attendance

### 5.1 Mark Attendance
- Mark a student present/absent/late for a given date
- Attempt to mark the same date twice — prompted to update existing record

### 5.2 Attendance List
- Attendance records sorted by date
- Load more pagination works

### 5.3 Reports
- Open class reports — attendance calendar renders correctly
- Navigate between months — data updates
- Homework completion stats shown per student
- Export / share report works

---

## 6. Teacher — Parents

### 6.1 Invite Parent
- Add parent email to a student — invite email sent
- Parent's invite status shows "pending" until they sign in

### 6.2 Remove Parent
- Remove a parent from a student — they lose access to that student's data
- Parent no longer sees the student after next refresh

---

## 7. Invited Teacher (Shared Class Access)

### 7.1 Accepting Invite
- Teacher receives invite email, signs up/logs in
- Shared class appears in their class list

### 7.2 Permissions
- Invited teacher can view all students in the shared class
- Invited teacher can add/edit/delete homework for those students
- Invited teacher can mark attendance
- Invited teacher CANNOT see classes they weren't invited to

### 7.3 Access Revoked
- Class owner removes invited teacher — they can no longer see the class or its data after next refresh

---

## 8. Parent — Home

### 8.1 Dashboard
- Linked children shown on home screen
- Recent homework summary shown
- Recent attendance summary shown

### 8.2 Child Filter
- If multiple children, filter by child — data updates to show only that child's records

### 8.3 Pull to Refresh
- Pull to refresh checks for new invites — newly linked children appear
- click on refresh button (top right) of home, homework, and attendance pages to refresh data

---

## 9. Parent — Homework

### 9.1 View Homework
- All homework for linked children listed
- Homework shows student name, title, due date, evaluation if set
- Filter by child (child filter) works

### 9.2 Pagination
- Load more shows older homework records

---

## 10. Parent — Attendance

### 10.1 View Attendance
- All attendance records for linked children listed
- Each record shows student name, date, status (present/absent/late)
- Filter by child works

### 10.2 Pagination
- Load more shows older records (10+ records)

---

## 11. Security / Permissions

### 11.1 Cross-Teacher Isolation
- Teacher A cannot see Teacher B's students, homework, or attendance

### 11.2 Parent Isolation
- Parent can only see students they are linked to
- Unlinked parent gets no results (not an error, just empty)

### 11.3 Invited Teacher Isolation
- Invited teacher can only see classes they were explicitly invited to

### 11.4 Parent Cannot Write
- Parent has no way to create or edit homework or attendance records

### 11.5 Unauthenticated Access
- Logging out and attempting to access any deep link shows login screen

---

## 12. Settings & Account

### 12.1 Push Notifications
- Enable notifications — token registered to user profile
- Disable notifications — token removed

### 12.2 Sign Out
- Sign out redirects to login screen
- Re-login restores correct state

### 12.3 Account Info
- Name and email displayed correctly in settings

### 12.4 Delete Account — Parent
- Open Help & Support from parent settings — Danger Zone section visible at the bottom with red title and bordered container
- Tap "Delete Account" in Danger Zone — confirmation modal appears with warning text
- Tap "Cancel" — modal dismisses, account unchanged
- Tap "Yes, Delete My Account" — loading state shown while deletion is in progress
- After deletion: redirected to login/signup screen
- Attempt to sign in with the deleted account credentials — login fails (account no longer exists)
- Sign up with the same email after deletion — new account created successfully (clean slate, no linked children)
- Verify the deleted user's Firestore `users` doc no longer exists
- If session is too old (`auth/requires-recent-login`): error message instructs user to sign out and back in before retrying
- Parent FAQ entry "How do I delete my account?" references the Danger Zone section on the Help & Support page

### 12.5 Delete Account — Teacher (not supported)
- Confirm there is no "Delete Account" button or Danger Zone on the teacher settings or help pages
- Open teacher Help & Support — FAQ entry "How do I delete my account?" is present
- FAQ answer directs teacher to email info@youngmomins.com for deletion request

---

## 13. Edge Cases

| Scenario | Expected |
|---|---|
| Student with no homework yet | Empty state, no crash |
| Student with no attendance yet | Empty state, no crash |
| Parent with no linked children | Empty state shown, prompt to contact teacher |
| Invited teacher accepts invite when already signed in | Class appears after next app refresh |
| Two parents invite same parent email to same student | Deduplication — parent linked once |
| Teacher deletes class that has students | Students and their records removed cleanly |
| Homework assigned for a past date | Saved correctly, shown in list |
| Network offline | Graceful error, no crash |
