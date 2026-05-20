DELETE FROM `es_system__auth_session`
WHERE `user_id` = 'NyxaK7z2cIkw6oz1opIanOlZVglwWT7F';
--> statement-breakpoint
DELETE FROM `es_system__auth_account`
WHERE `user_id` = 'NyxaK7z2cIkw6oz1opIanOlZVglwWT7F'
   OR `account_id` = 'NyxaK7z2cIkw6oz1opIanOlZVglwWT7F';
--> statement-breakpoint
DELETE FROM `es_system__auth_user`
WHERE `id` = 'NyxaK7z2cIkw6oz1opIanOlZVglwWT7F'
   OR `email` = 'random-test-no-whitelist@gmail.com';
