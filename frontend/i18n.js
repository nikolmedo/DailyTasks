/**
 * Frontend i18n runtime — catalogs are bundled inline so no network fetch is needed.
 * Provides i18n.load(lang), i18n.t(key, vars), i18n.apply(root), i18n.currentLang().
 */

const i18n = (() => {
  // ── Bundled translation catalogs ──────────────────────────────────────────
  const CATALOGS = {
    es: {
      app: {
        title: 'Daily Tasks',
        subtitle: 'Panel de control',
        statusNow: 'Ahora',
        statusIdle: 'En reposo',
        statusActive: 'En curso',
        statusAllDay: 'Todo el día',
        today: 'Hoy · {date}',
        refreshDisplay: 'Actualizar pantalla y LED',
        remaining: 'Quedan {time}',
        startsIn: 'Empieza en {time}',
        nextUp: 'Próxima',
        nextTomorrow: 'Mañana',
        nothingNext: 'Nada más por hoy',
        freeNow: 'Tiempo libre',
        elapsed: '{n}% completado',
        offline: 'Sin conexión con el dispositivo',
        reconnected: 'Conexión restablecida'
      },
      device: {
        title: 'Dispositivo',
        screen: 'Pantalla e-ink',
        screenHint: 'Vista en vivo · 250 × 128 px',
        led: 'LED RGB',
        ledOn: 'Encendido',
        ledOff: 'Apagado',
        ledUnavailable: 'No disponible',
        refresh: 'Refrescar ahora',
        scheduler: 'Planificador',
        schedulerOn: 'Activo',
        schedulerOff: 'Detenido'
      },
      timeline: {
        title: 'Línea del día',
        now: 'Ahora',
        empty: 'Día libre',
        allDayRow: 'Todo el día'
      },
      settings: {
        title: 'Ajustes',
        ledBrightness: 'Brillo del LED',
        timezone: 'Zona horaria',
        timeFormat: 'Formato de hora',
        timeFormat24: '24 horas',
        timeFormat12: '12 horas (AM/PM)',
        language: 'Idioma',
        languageEs: 'Español',
        languageEn: 'English',
        save: 'Guardar ajustes',
        dst: 'Horario de verano activo',
        dstInactive: 'Sin horario de verano',
        syncInterval: 'Sincronizar calendarios cada'
      },
      calendar: {
        title: 'Calendarios',
        subtitle: 'Google Calendar y cualquier feed iCal',
        add: 'Conectar calendario',
        addTitle: 'Conectar un calendario',
        urlLabel: 'Dirección iCal (.ics)',
        urlPlaceholder: 'https://calendar.google.com/calendar/ical/.../basic.ics',
        nameLabel: 'Nombre (opcional)',
        namePlaceholder: 'Se toma del calendario',
        colorLabel: 'Color del LED para sus eventos',
        connect: 'Conectar',
        connecting: 'Comprobando el calendario…',
        empty: 'Todavía no hay calendarios conectados.',
        emptyHint: 'Conecta uno y sus eventos aparecerán en tu día.',
        syncNow: 'Sincronizar',
        syncing: 'Sincronizando…',
        lastSync: 'Última sincronización: {time}',
        neverSynced: 'Sin sincronizar',
        events: '{n} eventos',
        enable: 'Activar calendario',
        disable: 'Pausar calendario',
        paused: 'En pausa',
        remove: 'Quitar calendario',
        removeConfirm: '¿Quitar este calendario? Sus eventos dejarán de aparecer.',
        readOnly: 'Solo lectura',
        error: 'Error de sincronización',
        help: '¿Cómo obtengo la dirección?',
        helpSteps: 'En Google Calendar abre <b>Configuración</b> → elige el calendario → <b>Integrar calendario</b> → copia la <b>Dirección secreta en formato iCal</b>. Funciona también con calendarios compartidos contigo.',
        helpWarning: 'Esa dirección da acceso de lectura a tu calendario: trátala como una contraseña.'
      },
      task: {
        new: 'Nueva tarea',
        newShort: 'Nueva',
        edit: 'Editar tarea',
        save: 'Guardar tarea',
        cancel: 'Cancelar',
        close: 'Cerrar',
        name: 'Nombre',
        namePlaceholder: 'p. ej. Trabajo profundo',
        from: 'Desde',
        to: 'Hasta',
        allDay: 'Todo el día',
        activeDays: 'Días activos',
        ledColor: 'Color del LED',
        ledOff: 'Apagar LED',
        ledOn: 'Encender LED',
        ledOffLabel: 'LED apagado',
        markDone: 'Marcar como hecha',
        unmarkDone: 'Desmarcar tarea',
        editAction: 'Editar tarea',
        deleteAction: 'Eliminar tarea',
        fromCalendar: 'Viene de {name}',
        overlaps: 'Se solapa con otra tarea',
        crossesMidnight: 'Cruza la medianoche',
        presets: 'Rápidos',
        selectAllDays: 'Todos',
        selectWeekdays: 'L–V',
        selectWeekend: 'S–D'
      },
      tasks: {
        title: 'Tareas',
        search: 'Buscar tareas…',
        searchLabel: 'Buscar',
        filterToday: 'Hoy',
        filterAll: 'Todas',
        emptyText: 'Aún no hay tareas.',
        emptyHint: 'Crea la primera para iluminar tu día.',
        activeEmptyText: 'Aún no hay tareas activas.',
        activeEmptyHint: 'Crea la primera para iluminar tu día.',
        todayEmptyText: 'Hoy no hay nada programado.',
        todayEmptyHint: 'Disfruta el día libre.',
        noResults: 'Sin resultados para «{q}»',
        noResultsHint: 'Prueba con otro término.',
        completed: 'Completadas',
        showMore: 'Ver {n} más',
        hideOld: 'Ocultar antiguas',
        allDays: 'Todos los días',
        noDays: 'Sin días',
        weekdays: 'Lunes a viernes',
        weekends: 'Fines de semana',
        past: 'Ya pasó',
        upcoming: 'Por venir'
      },
      days: {
        long: { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado' },
        short: { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' },
        letter: { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' }
      },
      units: {
        minutes: '{n} min',
        hours: '{n} h',
        hoursMinutes: '{h} h {m} min',
        minutesShort: '{n}m'
      },
      notifications: {
        taskCreated: 'Tarea creada',
        taskUpdated: 'Tarea actualizada',
        taskDeleted: 'Tarea eliminada',
        taskRestored: 'Tarea restaurada',
        configSaved: 'Configuración guardada',
        displayUpdated: 'Pantalla y LED actualizados',
        calendarAdded: 'Calendario conectado',
        calendarRemoved: 'Calendario quitado',
        calendarSynced: 'Calendarios sincronizados',
        calendarUpdated: 'Calendario actualizado',
        errorLoadTasks: 'Error al cargar tareas',
        errorLoadConfig: 'Error al cargar configuración',
        errorUpdateTask: 'Error al actualizar tarea',
        errorCreateTask: 'Error al crear tarea',
        errorDeleteTask: 'Error al eliminar tarea',
        errorSaveConfig: 'Error al guardar configuración',
        errorRefresh: 'Error al actualizar',
        errorCalendar: 'Error con el calendario',
        selectOneDay: 'Selecciona al menos un día',
        endBeforeStart: 'La hora de fin debe ser distinta de la de inicio',
        undo: 'Deshacer'
      },
      shortcuts: {
        title: 'Atajos',
        new: 'Nueva tarea',
        search: 'Buscar',
        refresh: 'Refrescar dispositivo',
        close: 'Cerrar'
      },
      display: { noTasks: 'Sin tareas', systemStarted: 'Sistema Iniciado', allDays: 'Todos' },
      tz: {
        pacific: 'Hora del Pacífico (EE.UU.)',
        mountain: 'Hora de la Montaña (EE.UU.)',
        central: 'Hora Central (EE.UU.)',
        eastern: 'Hora del Este (EE.UU.)',
        atlantic: 'Hora del Atlántico (Canadá)',
        newfoundland: 'Hora de Terranova',
        alaska: 'Hora de Alaska',
        hawaii: 'Hawái',
        mexicoCity: 'Ciudad de México',
        centralAmerica: 'Centroamérica',
        panama: 'Panamá',
        bogota: 'Bogotá / Lima / Quito',
        caracas: 'Caracas',
        lima: 'Lima',
        santiago: 'Santiago de Chile',
        buenosAires: 'Buenos Aires',
        saoPaulo: 'São Paulo / Brasilia',
        utc: 'UTC (Tiempo Universal)',
        london: 'Londres / Dublín / Lisboa',
        madrid: 'Madrid / París / Roma',
        berlin: 'Berlín / Ámsterdam / Bruselas',
        helsinki: 'Helsinki / Atenas / Bucarest',
        moscow: 'Moscú / San Petersburgo',
        cairo: 'El Cairo / Johannesburgo',
        nairobi: 'Nairobi / Kampala',
        dubai: 'Dubái / Abu Dabi',
        tehran: 'Teherán',
        karachi: 'Karachi / Islamabad',
        kolkata: 'Calcuta / Mumbai / Nueva Delhi',
        dhaka: 'Daca / Almaty',
        bangkok: 'Bangkok / Hanói / Yakarta',
        shanghai: 'Pekín / Chongqing / Urumqi',
        hongKong: 'Hong Kong / Singapur / Kuala Lumpur',
        seoul: 'Seúl / Yakutsk',
        tokyo: 'Tokio / Osaka / Saporo',
        sydney: 'Sídney / Melbourne / Canberra',
        adelaide: 'Adelaida / Darwin',
        auckland: 'Auckland / Wellington'
      }
    },

    en: {
      app: {
        title: 'Daily Tasks',
        subtitle: 'Control panel',
        statusNow: 'Now',
        statusIdle: 'At rest',
        statusActive: 'In progress',
        statusAllDay: 'All day',
        today: 'Today · {date}',
        refreshDisplay: 'Refresh display and LED',
        remaining: '{time} left',
        startsIn: 'Starts in {time}',
        nextUp: 'Next',
        nextTomorrow: 'Tomorrow',
        nothingNext: 'Nothing else today',
        freeNow: 'Free time',
        elapsed: '{n}% elapsed',
        offline: 'No connection to the device',
        reconnected: 'Connection restored'
      },
      device: {
        title: 'Device',
        screen: 'E-ink screen',
        screenHint: 'Live view · 250 × 128 px',
        led: 'RGB LED',
        ledOn: 'On',
        ledOff: 'Off',
        ledUnavailable: 'Unavailable',
        refresh: 'Refresh now',
        scheduler: 'Scheduler',
        schedulerOn: 'Running',
        schedulerOff: 'Stopped'
      },
      timeline: {
        title: 'Day timeline',
        now: 'Now',
        empty: 'Free day',
        allDayRow: 'All day'
      },
      settings: {
        title: 'Settings',
        ledBrightness: 'LED brightness',
        timezone: 'Timezone',
        timeFormat: 'Time format',
        timeFormat24: '24 hours',
        timeFormat12: '12 hours (AM/PM)',
        language: 'Language',
        languageEs: 'Español',
        languageEn: 'English',
        save: 'Save settings',
        dst: 'Daylight saving active',
        dstInactive: 'Standard time',
        syncInterval: 'Sync calendars every'
      },
      calendar: {
        title: 'Calendars',
        subtitle: 'Google Calendar and any iCal feed',
        add: 'Connect calendar',
        addTitle: 'Connect a calendar',
        urlLabel: 'iCal address (.ics)',
        urlPlaceholder: 'https://calendar.google.com/calendar/ical/.../basic.ics',
        nameLabel: 'Name (optional)',
        namePlaceholder: 'Taken from the calendar',
        colorLabel: 'LED colour for its events',
        connect: 'Connect',
        connecting: 'Checking the calendar…',
        empty: 'No calendars connected yet.',
        emptyHint: 'Connect one and its events will show up in your day.',
        syncNow: 'Sync',
        syncing: 'Syncing…',
        lastSync: 'Last sync: {time}',
        neverSynced: 'Never synced',
        events: '{n} events',
        enable: 'Enable calendar',
        disable: 'Pause calendar',
        paused: 'Paused',
        remove: 'Remove calendar',
        removeConfirm: 'Remove this calendar? Its events will stop appearing.',
        readOnly: 'Read only',
        error: 'Sync error',
        help: 'How do I get the address?',
        helpSteps: 'In Google Calendar open <b>Settings</b> → pick the calendar → <b>Integrate calendar</b> → copy the <b>Secret address in iCal format</b>. This works for calendars shared with you too.',
        helpWarning: 'That address grants read access to your calendar — treat it like a password.'
      },
      task: {
        new: 'New task',
        newShort: 'New',
        edit: 'Edit task',
        save: 'Save task',
        cancel: 'Cancel',
        close: 'Close',
        name: 'Name',
        namePlaceholder: 'e.g. Deep work',
        from: 'From',
        to: 'To',
        allDay: 'All day',
        activeDays: 'Active days',
        ledColor: 'LED colour',
        ledOff: 'Turn off LED',
        ledOn: 'Turn on LED',
        ledOffLabel: 'LED off',
        markDone: 'Mark as done',
        unmarkDone: 'Unmark task',
        editAction: 'Edit task',
        deleteAction: 'Delete task',
        fromCalendar: 'From {name}',
        overlaps: 'Overlaps another task',
        crossesMidnight: 'Crosses midnight',
        presets: 'Quick picks',
        selectAllDays: 'All',
        selectWeekdays: 'Mon–Fri',
        selectWeekend: 'Sat–Sun'
      },
      tasks: {
        title: 'Tasks',
        search: 'Search tasks…',
        searchLabel: 'Search',
        filterToday: 'Today',
        filterAll: 'All',
        emptyText: 'No tasks yet.',
        emptyHint: 'Create the first one to light up your day.',
        activeEmptyText: 'No active tasks yet.',
        activeEmptyHint: 'Create the first one to light up your day.',
        todayEmptyText: 'Nothing scheduled today.',
        todayEmptyHint: 'Enjoy the free day.',
        noResults: 'No results for “{q}”',
        noResultsHint: 'Try a different term.',
        completed: 'Completed',
        showMore: 'Show {n} more',
        hideOld: 'Hide old',
        allDays: 'Every day',
        noDays: 'No days',
        weekdays: 'Monday to Friday',
        weekends: 'Weekends',
        past: 'Passed',
        upcoming: 'Upcoming'
      },
      days: {
        long: { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' },
        short: { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' },
        letter: { 0: 'Su', 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa' }
      },
      units: {
        minutes: '{n} min',
        hours: '{n} h',
        hoursMinutes: '{h} h {m} min',
        minutesShort: '{n}m'
      },
      notifications: {
        taskCreated: 'Task created',
        taskUpdated: 'Task updated',
        taskDeleted: 'Task deleted',
        taskRestored: 'Task restored',
        configSaved: 'Settings saved',
        displayUpdated: 'Display and LED updated',
        calendarAdded: 'Calendar connected',
        calendarRemoved: 'Calendar removed',
        calendarSynced: 'Calendars synced',
        calendarUpdated: 'Calendar updated',
        errorLoadTasks: 'Error loading tasks',
        errorLoadConfig: 'Error loading settings',
        errorUpdateTask: 'Error updating task',
        errorCreateTask: 'Error creating task',
        errorDeleteTask: 'Error deleting task',
        errorSaveConfig: 'Error saving settings',
        errorRefresh: 'Error refreshing',
        errorCalendar: 'Calendar error',
        selectOneDay: 'Select at least one day',
        endBeforeStart: 'End time must differ from start time',
        undo: 'Undo'
      },
      shortcuts: {
        title: 'Shortcuts',
        new: 'New task',
        search: 'Search',
        refresh: 'Refresh device',
        close: 'Close'
      },
      display: { noTasks: 'No tasks', systemStarted: 'System started', allDays: 'All' },
      tz: {
        pacific: 'Pacific Time (US & Canada)',
        mountain: 'Mountain Time (US & Canada)',
        central: 'Central Time (US & Canada)',
        eastern: 'Eastern Time (US & Canada)',
        atlantic: 'Atlantic Time (Canada)',
        newfoundland: 'Newfoundland',
        alaska: 'Alaska',
        hawaii: 'Hawaii',
        mexicoCity: 'Mexico City',
        centralAmerica: 'Central America',
        panama: 'Panama',
        bogota: 'Bogotá / Lima / Quito',
        caracas: 'Caracas',
        lima: 'Lima',
        santiago: 'Santiago',
        buenosAires: 'Buenos Aires',
        saoPaulo: 'São Paulo / Brasilia',
        utc: 'UTC (Universal Time)',
        london: 'London / Dublin / Lisbon',
        madrid: 'Madrid / Paris / Rome',
        berlin: 'Berlin / Amsterdam / Brussels',
        helsinki: 'Helsinki / Athens / Bucharest',
        moscow: 'Moscow / St. Petersburg',
        cairo: 'Cairo / Johannesburg',
        nairobi: 'Nairobi / Kampala',
        dubai: 'Dubai / Abu Dhabi',
        tehran: 'Tehran',
        karachi: 'Karachi / Islamabad',
        kolkata: 'Kolkata / Mumbai / New Delhi',
        dhaka: 'Dhaka / Almaty',
        bangkok: 'Bangkok / Hanoi / Jakarta',
        shanghai: 'Beijing / Chongqing / Urumqi',
        hongKong: 'Hong Kong / Singapore / Kuala Lumpur',
        seoul: 'Seoul / Yakutsk',
        tokyo: 'Tokyo / Osaka / Sapporo',
        sydney: 'Sydney / Melbourne / Canberra',
        adelaide: 'Adelaide / Darwin',
        auckland: 'Auckland / Wellington'
      }
    }
  };

  const SUPPORTED = ['es', 'en'];

  let lang = 'es';
  let catalog = CATALOGS.es;

  /**
   * Switch to the given language. Synchronous — no network needed.
   */
  function load(newLang) {
    const resolved = SUPPORTED.includes(newLang) ? newLang : 'es';
    lang = resolved;
    catalog = CATALOGS[resolved];
    document.documentElement.lang = lang;
    // Return a resolved promise so callers can still await it
    return Promise.resolve();
  }

  /**
   * Resolve a dot-separated key, interpolating {var} placeholders.
   */
  function t(key, vars = {}) {
    const parts = key.split('.');
    let val = catalog;
    for (const p of parts) val = val?.[p];
    if (typeof val !== 'string') return key;
    return val.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  }

  /**
   * Apply translations to all elements with data-i18n* attributes in root.
   *   data-i18n             → textContent
   *   data-i18n-html        → innerHTML (for strings with inline markup)
   *   data-i18n-placeholder → placeholder attribute
   *   data-i18n-aria        → aria-label attribute
   *   data-i18n-title       → title attribute
   *   data-i18n-option      → textContent of a <option>
   */
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-option]').forEach(el => {
      el.textContent = t(el.dataset.i18nOption);
    });
    document.title = t('app.title');
  }

  function currentLang() { return lang; }

  return { load, t, apply, currentLang, SUPPORTED };
})();
