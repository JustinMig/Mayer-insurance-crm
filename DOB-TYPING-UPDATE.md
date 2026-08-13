# Date of Birth Typing Update

- Replaced the device-native Date of Birth date picker with a typeable text field on Add Client and Edit Client.
- DOB entry uses MM/DD/YYYY on every device, including iPhone, iPad, Mac, Android, and Windows.
- Numeric keyboard is requested on mobile devices.
- Slashes are inserted automatically while typing.
- Existing ISO database values display as MM/DD/YYYY when editing a client.
- Server-side validation converts MM/DD/YYYY back to YYYY-MM-DD before saving to the database.
- Invalid calendar dates are rejected before database writes.
