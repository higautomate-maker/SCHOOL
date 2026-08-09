import 'package:flutter/material.dart';
import 'package:hig_mobile_core/hig_mobile_core.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3002',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const HigMobileApp(
      config: HigMobileAppConfig(
        title: 'Hig Student & Parent',
        appId: 'com.higautomation.higschool.studentparent',
        allowedPrincipalTypes: ['student', 'parent'],
        apiBaseUrl: apiBaseUrl,
      ),
    ),
  );
}
