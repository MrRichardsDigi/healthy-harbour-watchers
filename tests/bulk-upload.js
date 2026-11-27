(async function () {
  const results = document.getElementById('results');
  try {
    if (!window.Papa || !window.XLSX) throw new Error('CSV or Excel test library failed to load.');
    const response = await fetch('../data/locations.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load site metadata.');
    const originalMapping = await response.json();
    let mapping = structuredClone(originalMapping);
    const sites = originalMapping.map(site => ({ id: Number(site.id), location: site.name }));
    let calls = [];
    let duplicates = [];
    let publishFailures = 0;
    const originalFetch = window.fetch;
    window.fetch = (url, options) => url === 'data/locations.json'
      ? Promise.resolve(new Response(JSON.stringify(mapping), { status: 200 }))
      : originalFetch(url, options);
    const client = {
      from: () => ({ select: async () => ({ data: sites, error: null }) }),
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'bulk_measurement_duplicates') return { data: duplicates, error: null };
        if (publishFailures > 0) {
          publishFailures--;
          return { error: { message: 'Simulated network failure' } };
        }
        return { error: null };
      }
    };
    window.confirm = () => true;
    setupBulkUpload(client);

    const file = document.getElementById('csv-upload');
    const date = document.getElementById('csv-sampling-date');
    const button = document.getElementById('upload-csv-btn');
    const status = document.getElementById('csv-upload-status');
    const preview = document.getElementById('bulk-preview');
    const passed = [];
    function assert(condition, message) {
      if (!condition) throw new Error(`${message}: ${status.textContent} ${preview.textContent}`);
    }
    async function waitFor(condition) {
      for (let i = 0; i < 200; i++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Timed out waiting for uploader.');
    }
    async function run(contents, name = 'test.csv') {
      calls = [];
      const transfer = new DataTransfer();
      transfer.items.add(new File([contents], name));
      file.files = transfer.files;
      file.dispatchEvent(new Event('change'));
      date.value = '2026-10-17';
      date.dispatchEvent(new Event('change'));
      button.click();
      await waitFor(() => !button.disabled && !!status.textContent);
    }
    const header = 'Site,Date,water temp oC\n';
    const ids = [4, 11, 5, 6, 10, 9, 7, 8];
    const names = ['Mussel Bay', 'Stream at Sawyers Bay', 'Ravensbourne Boat Club',
      'Leith River Mouth', "Anderson's Bay Outlet", 'Sommerville Creek',
      'MacAndrew Bay Marina', 'MacAndrew Bay Stormwater Outfall'];
    await run(header + ids.map((_, i) => `#${i + 1},17 Oct 2026,${i + 10}`).join('\n'));
    let payload = calls[0].args.p_measurements;
    assert(JSON.stringify(payload.map(item => item.locationid)) === JSON.stringify(ids), 'Site IDs');
    assert([...preview.querySelectorAll('tbody tr')].every((row, i) =>
      row.cells[0].textContent === `${i + 1} - ${names[i]}`), 'Site names');
    preview.querySelector('button').click();
    await waitFor(() => status.textContent.startsWith('Published'));
    assert(JSON.stringify(calls[1].args.p_measurements) === JSON.stringify(payload), 'Publish payload');
    passed.push('All eight site numbers, preview names and publish payload');

    await run(header + '9,17 Oct 2026,12');
    assert(preview.textContent.includes('unknown or missing site') && !calls.length, 'Unknown site');
    await run(header + '1,17 Oct 2026,10\n#1,17 Oct 2026,11');
    assert(preview.textContent.includes('duplicate Water temperature') && !calls.length, 'Duplicate input');
    await run(header + '2,17 Oct 2026,>382');
    assert(preview.textContent.includes('invalid Water temperature') && !calls.length, 'Qualified value');
    passed.push('Unknown sites, duplicate inputs and qualified values are rejected');

    mapping.find(site => site.currentSite === 2).currentSite = 1;
    await run(header + '1,17 Oct 2026,10');
    assert(status.textContent.includes('mapping is invalid') && !calls.length, 'Ambiguous mapping');
    mapping = structuredClone(originalMapping);
    mapping.find(site => site.currentSite === 2).name = 'Wrong site';
    await run(header + '2,17 Oct 2026,10');
    assert(status.textContent.includes('mapping is invalid') && !calls.length, 'Database mismatch');
    mapping = structuredClone(originalMapping);
    duplicates = [{ locationid: 11, parameterid: 1 }];
    await run(header + '2,17 Oct 2026,10');
    assert(preview.textContent.includes('Already exists for 2 - Stream at Sawyers Bay') &&
      !preview.querySelector('button'), 'Existing duplicate');
    duplicates = [];
    passed.push('Ambiguous mappings, database mismatches and existing duplicates are rejected');

    await run(header + '2,16 Oct 2026,10');
    preview.querySelector('button').click();
    assert(status.textContent.includes('confirm') && calls.length === 1, 'Warning acknowledgement');
    preview.querySelector('input').checked = true;
    publishFailures = 1;
    preview.querySelector('button').click();
    await waitFor(() => status.textContent.startsWith('Publish failed'));
    preview.querySelector('button').click();
    await waitFor(() => status.textContent.startsWith('Published'));
    const published = calls.filter(call => call.name === 'publish_bulk_measurements');
    assert(published.length === 2 && published[0].args.p_id === published[1].args.p_id &&
      JSON.stringify(published[0].args.p_measurements) === JSON.stringify(published[1].args.p_measurements),
      'Safe retry');
    passed.push('Date warnings require acknowledgement; retries retain the upload ID and payload');

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Site', 'Date', 'water temp oC', 'sal adj'],
      ['#2', '17 Oct 2026', 10, 32], ['#5', '17 Oct 2026', 11, 30]
    ]), 'SRF2');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Site', 'water temp oC'], [1, 99]]), 'Other');
    await run(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }), 'test.xlsx');
    payload = calls[0].args.p_measurements;
    assert(JSON.stringify(payload.map(item => item.locationid)) === JSON.stringify([11, 11, 10, 10]) &&
      payload.length === 4, 'Excel SRF2 mapping');
    passed.push('Excel SRF2 sheet mapping; other sheets ignored');
    results.textContent = `PASS\n${passed.join('\n')}`;
    results.dataset.result = 'pass';
  } catch (error) {
    results.textContent = `FAIL: ${error.message}`;
    results.dataset.result = 'fail';
    console.error(error);
  }
})();
