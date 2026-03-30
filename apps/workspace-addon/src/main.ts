import { buildRecorderHomePage } from './ui';

/***********************
 * VoiceUp Add-on entry
 ***********************/
function onHomepage(e: GoogleAppsScript.Addons.EventObject) {
  return buildRecorderHomePage(e);
}

function getContextualAddOn(e: GoogleAppsScript.Addons.EventObject) {
  return buildRecorderHomePage(e);
}

function onInstall(e: GoogleAppsScript.Events.AddonOnInstall) {
  onOpen(e);
}

function onOpen(
  e: GoogleAppsScript.Events.DocsOnOpen | GoogleAppsScript.Events.AddonOnInstall
) {
  // Reserved for future initialization inside Classroom UI
}

function launchRecorder(e: GoogleAppsScript.Addons.EventObject) {
  const common = e.commonEventObject;
  const params = common?.parameters ?? {};
  const locale = common?.userLocale ?? 'en';
  const timezone = common?.timeZone?.id ?? 'UTC';
  const recorderUrl = buildRecorderUrl({
    classId: params['classId'] ?? '',
    courseworkId: params['courseWorkId'] ?? '',
    submissionId: params['submissionId'] ?? '',
    locale,
    timezone,
  });

  const openLink = CardService.newOpenLink()
    .setUrl(recorderUrl)
    .setOpenAs(CardService.OpenAs.FULL_SIZE)
    .setOnClose(CardService.OnClose.NOTHING);

  return CardService.newActionResponseBuilder().setOpenLink(openLink).build();
}

function buildRecorderUrl(options: {
  classId: string;
  courseworkId: string;
  submissionId: string;
  locale: string;
  timezone: string;
}) {
  const query = [
    ['classId', options.classId],
    ['courseworkId', options.courseworkId],
    ['submissionId', options.submissionId],
    ['locale', options.locale],
    ['timezone', options.timezone],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const baseUrl = 'https://voiceup.example.com/recorder';
  return query ? `${baseUrl}?${query}` : baseUrl;
}
