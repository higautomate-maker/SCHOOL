# HIG School sales-demo access

No sales-demo password or static bearer token is stored in this repository.
Demo routes are unavailable unless the deployment is explicitly configured as
a sales-demo and `HIG_DEMO_ACCOUNTS_JSON` is supplied through the hosting secret
manager.

For Flutter sales-demo builds, inject a role-specific account at build time:

```sh
flutter build apk \
  --dart-define=API_BASE_URL=https://sales-demo.example.com \
  --dart-define=HIG_DEMO_EMAIL='<provisioned demo email>' \
  --dart-define=HIG_DEMO_PASSWORD='<provisioned demo password>'
```

Do not commit the command, shell history, generated configuration, password, or
token. Real web credentials and sessions are completely separate from these
sales-demo endpoints. Mobile token authentication is outside Stage 7.
