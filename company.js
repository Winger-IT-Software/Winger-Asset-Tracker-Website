const url = 'https://winger-asset-tracker-c579f-default-rtdb.firebaseio.com/.json';
const historyUrl = 'https://winger-asset-tracker-c579f-default-rtdb.firebaseio.com/DC-history.json'; 
const currentUrl = 'https://winger-asset-tracker-c579f-default-rtdb.firebaseio.com/Current.json';
const dcCurrentUrl = 'https://winger-asset-tracker-c579f-default-rtdb.firebaseio.com/DC-current.json';

let globalData = null;
let companyNames = [];
let selectedReportType = '';
let enteredNumber = '';
let selectedCompany = ''; 

async function fetchData() {
    if (globalData !== null) return globalData;
    try {
        const response = await fetch(url);
        const data = await response.json();
        globalData = data;
        companyNames = Object.keys(data.Current).sort();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('data-container').innerText = 'Failed to load data.';
        return null;
    }
}

async function cloneCurrentToDCCurrent() {
    try {
        const response = await fetch(currentUrl);
        const currentData = await response.json();

        if (!currentData) {
            throw new Error('Failed to fetch data from Current folder.');
        }

        const dcCurrentResponse = await fetch(dcCurrentUrl);
        const dcCurrentData = await dcCurrentResponse.json();

        if (!dcCurrentData) {
            throw new Error('Failed to fetch data from DC-current folder.');
        }

        Object.keys(currentData).forEach(key => {
            if (dcCurrentData[key]) {
                dcCurrentData[key] = { ...dcCurrentData[key], ...currentData[key] };
            } else {
                dcCurrentData[key] = currentData[key];
            }
        });

        await fetch(dcCurrentUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dcCurrentData),
        });

        console.log('Data successfully cloned to DC-current folder.');
    } catch (error) {
        console.error('Error cloning data:', error);
    }
}

cloneCurrentToDCCurrent();


function jsonToTable(jsonData) {
    let table = '<table>';
    
    table += '<thead><tr>';
    table += '<th>SL</th>'; // Serial number column first
    table += '<th>Asset Details</th>'; 
    table += '<th>Asset Number</th>'; // Laptop number column last
    table += '</tr></thead><tbody>';

    let serialNumber = 1;

    Object.keys(jsonData).forEach(companyName => {
        if (selectedCompany && companyName.toLowerCase() !== selectedCompany.toLowerCase()) {
            return;
        }

        const companyData = jsonData[companyName];
        Object.keys(companyData).forEach(laptopNumber => {
            const laptopData = companyData[laptopNumber];
            
            const mainSerialNumber = laptopData['Main_Serial_Number'] || '-';
            
            let itemName = '';
            itemName += `Main Serial: ${mainSerialNumber}<br>`;
            itemName += `CPU: ${laptopData.Processor ? laptopData.Processor['Model name'] : '-'}<br>`;
            
            let ramText = '';
            let isFirst = true;
            for (let i = 1; i <= 8; i++) {
                const slotKey = `Slot ${i}`;
                const ramSlot = laptopData.RAM && laptopData.RAM[slotKey];
                if (ramSlot && ramSlot.Capacity && ramSlot.Capacity !== 'No Module Installed') {
                    const ramInGB = convertMBtoGB(ramSlot.Capacity); // Convert RAM from MB to GB
                    if (!isFirst) {
                        ramText += ' / ';
                    }
                    ramText += `Slot ${i}: ${ramInGB}GB`;
                    isFirst = false;
                }
            }
            itemName += `RAM: ${ramText || '-'}<br>`;

            // Make ROM handling dynamic, filter ROMs less than 40GB, and standardize sizes
            let romText = '';
            const romDevices = laptopData.ROM || {};
            Object.keys(romDevices).forEach(deviceKey => {
                const device = romDevices[deviceKey];
                if (device && device.Size && (device.Device.includes('nvme') || device.Device.includes('sda'))) {
                    // Convert the size to a number (assuming the size is in GB or TB)
                    let sizeInGB = parseFloat(device.Size);
                    // Only include devices with size greater than or equal to 40GB
                    if (sizeInGB >= 40) {
                        // Determine if it's SSD or HDD
                        const deviceType = device.Device.includes('nvme') ? 'SSD' : 'HDD';
                        // Standardize ROM sizes
                        const standardizedSize = standardizeSize(sizeInGB);
                        let sizeInGBz;
                        console.log(sizeInGB)
                        sizeInGB = sizeInGB * 1.0737
                        sizeInGB = Math.round(sizeInGB);
                        sizeInGBz = sizeInGB%10
                        if(sizeInGBz == 0){
                            console.log("HDD")
                            romText += `${"HDD"} : ${sizeInGB } "GB"<br>`;
                        }
                        else{
                            console.log("SSD")
                            romText += `${"SSD"} : ${sizeInGB} "GB"<br>`;
                        }
                        console.log(sizeInGB)
                        
                        
                    }
                }
            });
            itemName += `ROM: ${romText || '-'}<br>`;
            
            const curStatus = laptopData.CUR || '-';
            
            table += `<tr>`;
            table += `<td>${serialNumber++}</td>`; // Serial number column
            table += `<td>${itemName}</td>`;
            table += `<td>${laptopNumber}</td>`; // Laptop number column last
            table += `</tr>`;
        });
    });

    table += '</tbody></table>';
    return table;
}

// Function to convert RAM size from MB to GB
function convertMBtoGB(sizeInMB) {
    return (parseFloat(sizeInMB) / 1024).toFixed(2); // Convert MB to GB and keep 2 decimal places
}

// Function to standardize ROM sizes
function standardizeSize(sizeInGB) {
    if (sizeInGB >= 900 && sizeInGB <= 1100) return '1TB';
    if (sizeInGB >= 430 && sizeInGB <= 580) return '500GB';
    if (sizeInGB >= 180 && sizeInGB <= 260) return '256GB';
    if (sizeInGB >= 70 && sizeInGB <= 160) return '128GB';
 
    // Add more mappings as needed
    return `${Math.round(sizeInGB)}GB`; // Default fallback
}


async function searchData() {
    const searchValue = document.getElementById('search-company').value.toLowerCase();
    if (!globalData) {
        await fetchData();
    }
    if (globalData && globalData.Current) {
        const filteredData = Object.keys(globalData.Current)
            .filter(companyName => companyName.toLowerCase().includes(searchValue))
            .reduce((obj, key) => {
                obj[key] = globalData.Current[key];
                return obj;
            }, {});

        selectedCompany = searchValue;
        const filteredByType = filterDataBasedOnReportType(filteredData, selectedReportType, selectedCompany);
        document.getElementById('data-container').innerHTML = jsonToTable(filteredByType);
        console.log('Filtered Data:', filteredByType); 
    }
}

function showSuggestions(value) {
    const suggestionsDiv = document.getElementById('suggestions');
    suggestionsDiv.innerHTML = '';
    if (value.length > 0) {
        const fragment = document.createDocumentFragment();
        const filteredCompanyNames = companyNames.filter(name => name.toLowerCase().includes(value.toLowerCase()));
        filteredCompanyNames.forEach(name => {
            const suggestion = document.createElement('div');
            suggestion.textContent = name;
            suggestion.onclick = () => {
                document.getElementById('search-company').value = name;
                suggestionsDiv.style.display = 'none';
                searchData();
            };
            fragment.appendChild(suggestion);
        });
        suggestionsDiv.appendChild(fragment);
        suggestionsDiv.style.display = 'block';
    } else {
        suggestionsDiv.style.display = 'none';
    }
}

function filterDataBasedOnReportType(data, reportType, companyFilter = null) {
    const filteredData = {};
    const searchValue = document.getElementById('search-company').value.toLowerCase();

    const companiesToSearch = companyFilter
        ? Object.keys(data).filter(companyName => companyName.toLowerCase() === companyFilter.toLowerCase())
        : Object.keys(data);

    console.log(`Companies to search: ${companiesToSearch.join(', ')}`);

    companiesToSearch.forEach(companyName => {
        const companyData = data[companyName];
        filteredData[companyName] = {};

        Object.keys(companyData).forEach(laptopNumber => {
            const laptopData = companyData[laptopNumber];
            console.log(`Processing WIL Number: ${laptopNumber}`);

            let shouldFilterOut = false;

            if (shouldFilterOut) {
                return;
            }

            filteredData[companyName][laptopNumber] = laptopData;

            const firebaseURL = `DC-current/DC-current/${searchValue}/${laptopNumber}`;
            console.log(`Fetching data from: ${firebaseURL}`);
        });

        const filteredWILNumbers = Object.keys(filteredData[companyName]);
        console.log(`Filtered WIL numbers for company "${companyName}":`, filteredWILNumbers);
    });

    return filteredData;
}

let selectedLaptops = [];

function handleCheckboxChange(event, laptopNumber, companyName) {
    if (event.target.checked) {
        selectedLaptops.push({ laptopNumber, companyName });
        document.getElementById('push-data-container').style.display = 'inline-block';
    } else {
        selectedLaptops = selectedLaptops.filter(item => item.laptopNumber !== laptopNumber);
        if (selectedLaptops.length === 0) {
            document.getElementById('push-data-container').style.display = 'none';
        }
    }
}

async function pushData() {
    if (!selectedReportType || !enteredNumber || selectedLaptops.length === 0) {
        alert('Please select a report type, enter a number, and select at least one laptop.');
        return;
    }

    const updates = {};
    const historyUpdates = {};
    const dateTimeString = new Date().toISOString().replace(/[:.]/g, '-');

    const updateFolderPath = `history/${enteredNumber}/${dateTimeString}`;

    selectedLaptops.forEach(({ laptopNumber, companyName }) => {
        const laptopData = globalData.Current[companyName][laptopNumber] || {};
        const numberKey = `${selectedReportType}_Number`;
        const statusKey = `${selectedReportType}_STATUS`;

        const updatePath = `/DC-current/${companyName}/${laptopNumber}`;

        laptopData[numberKey] = enteredNumber;
        
        updates[`${updatePath}/DC_STATUS`] = 1;
        updates[`${updatePath}/RDC_STATUS`] = 0;
        updates[`${updatePath}/UDC_STATUS`] = 0;
        
        historyUpdates[`${updateFolderPath}`] = {
            Number: enteredNumber,
            Date: new Date().toISOString(),
            Action: `${selectedReportType} Number Added`,
            Main_Serial_Number: laptopData['Main_Serial_Number'] || '-',
            Processor: laptopData.Processor ? laptopData.Processor['Model name'] : '-',
            RAM: Object.keys(laptopData.RAM || {}).map(slot => ({
                Slot: slot,
                Capacity: laptopData.RAM[slot].Capacity || '-'
            })),
            ROM: {
                Device_1: (laptopData.ROM && laptopData.ROM['Device 1'] ? laptopData.ROM['Device 1'].Size : '-'),
                Device_2: (laptopData.ROM && laptopData.ROM['Device 2'] ? laptopData.ROM['Device 2'].Size : '-')
            },
            CUR: laptopData.CUR || '-'
        };
    });
    
    try {
        await fetch(dcCurrentUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
        });

        if (Object.keys(historyUpdates).length > 0) {
            await fetch(historyUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(historyUpdates),
            });
        }

        alert(`${selectedLaptops.length} laptop(s) updated with ${selectedReportType} Number: ${enteredNumber}`);
        selectedLaptops = [];

        const filteredData = filterDataBasedOnReportType(globalData.Current, selectedReportType, selectedCompany);
        document.getElementById('data-container').innerHTML = jsonToTable(filteredData);
    } catch (error) {
        console.error('Error updating data:', error);
        alert('Failed to update data in Firebase.');
    }
}



async function downloadPDF() {
    // Fetch the table body content from the HTML
    const tableBody = document.querySelector('#data-container table tbody').innerHTML;

    // Define the content for the PDF, including the dynamically fetched table data
    const pdfContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #000;">
            <h2 style="text-align: center; font-size: 16px; margin-bottom: 20px;">WINGER IT SOLUTIONS</h2>
            <!-- Centered and resized logo -->
            <img src="logo upscaled png format (2).png" style="display: block; margin: 0 auto; width: 200px; height: auto;"/>
            <p><strong>Billing Address:</strong> xxx Technologies Pvt Ltd, xth floor, x building, xx Manyata Tech Park, Karnataka, 5600x5, India, GSTIN: 29Axxxxx0R1ZB</p>
            <p><strong>Shipping Address:</strong> x Technologies Pvt Ltd, xth floor, x building, xx Manyata Tech Park, Bangalore, Karnataka, 5600x5, India</p>
            
            <h3 style="margin-top: 20px; margin-bottom: 10px;">Delivery Challan</h3>
            <p>Customer PO No: CONFIRMED BY MAIL DATED 290xx024</p>
            <p>Delivery Person Name: xxxxxM</p>
            <p>Contact Name: Mr. xxx Dxxxi, Contact Number: +9174xxxxx3707</p>
            <p>Date: 30-Aug-2024</p>
            <p>DC No: DC/8/24/xxx254</p>

            <p style="margin-top: 10px;">E.& O.E Hardware Supplied Without any prxxxoftware. We are not responsxxxATA LOSS on our rxxxts, alsxxxxkup or DATA xxxnot our scope of the job.</p>
            <p>Returnable in Good Condition: For Rental</p>
            <p>Comments: Power adapter with cable -4 carry case.-4</p>

            <h3 style="margin-top: 20px; margin-bottom: 10px;">Annexures</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="border: 1px solid #000; padding: 8px; background-color: #000; color: #fff;">SL No</th>
                        <th style="border: 1px solid #000; padding: 8px; background-color: #000; color: #fff;">Asset Details</th>
                        <th style="border: 1px solid #000; padding: 8px; background-color: #000; color: #fff;">Asset Name</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableBody} <!-- Insert dynamically fetched table data here -->
                </tbody>
            </table>
        </div>
    `;

    // Convert the HTML string into a PDF
    const opt = {
        margin: 0.5,
        filename: 'laptop_data.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // Use html2pdf to create the PDF
    html2pdf().from(pdfContent).set(opt).save();
}

// Ensure that fetchData runs when the window is loaded
window.onload = fetchData;
